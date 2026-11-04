import Book from "../models/Book.Model.js";
import BookRequest, { OPEN_STATUSES } from "../models/BookRequest.Model.js";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import policy from "../config/bookRequestPolicy.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/emailClient.js";
import { afterCommit } from "../utils/requestContext.js";

// Statuses the admin sets directly; "fulfilled" and "merged" have their own actions.
const ADMIN_STATUSES = ["open", "reviewing", "planned", "rejected"];

// What the community list may show (closed-as-rejected/merged/withdrawn is not listed).
const PUBLIC_STATUSES = [...OPEN_STATUSES, "fulfilled"];

const LIST_SORTS = {
  popular: { followerCount: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

const PUBLIC_FIELDS =
  "title author isbn language status followerCount statusNote history book mergedInto closedAt createdAt updatedAt";

const BOOK_POPULATE = { path: "book", select: "title author coverImage status" };

/**
 * Normalise a title/author so near-identical requests merge:
 * "The Alchemist " / "alchemist" / "ALCHEMIST!" → "alchemist".
 * Keeps letters of any script (Urdu too) and digits; drops accents,
 * punctuation and a leading English article.
 */
export const normalizeText = (text = "") =>
  String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/\s+/g, " ");

const normalizeIsbn = (isbn) => {
  const key = String(isbn || "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
  return key.length === 10 || key.length === 13 ? key : undefined;
};

const readFields = (body = {}) => {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const fields = {
    title: str(body.title),
    author: str(body.author),
    isbn: str(body.isbn) || undefined,
    language: str(body.language) || undefined,
    note: str(body.note) || undefined,
  };

  const keys = {
    titleKey: normalizeText(fields.title),
    authorKey: normalizeText(fields.author),
    isbnKey: normalizeIsbn(fields.isbn),
  };

  if (!keys.titleKey) throw new ErrorResponse("title is required", 400);
  if (fields.isbn && !keys.isbnKey) {
    throw new ErrorResponse("ISBN must have 10 or 13 digits.", 400);
  }

  return { fields, keys };
};

const toPublic = (request, following) => {
  const doc = request.toObject ? request.toObject() : request;
  const out = helper.pick(doc, ["_id", ...PUBLIC_FIELDS.split(" ")]);
  if (following !== undefined) out.following = following;
  return out;
};

/** Published book that already matches the request (ISBN, or title + author). */
const findInCatalog = async ({ title, author, isbn }, { isbnKey }, session) => {
  const exact = (text) => ({ $regex: `^${helper.escapeRegex(text)}$`, $options: "i" });

  const byTitle = { title: exact(title) };
  if (author) byTitle.author = exact(author);

  const or = [byTitle];
  if (isbnKey) or.push({ isbn: { $in: [isbn, isbnKey] } });

  return Book.findOne({ status: "published", $or: or })
    .select("title author coverImage")
    .session(session)
    .lean();
};

/**
 * The open request this one duplicates, if any: same ISBN, else same title
 * with the same author (or one of them left the author blank).
 */
const findOpenMatch = async ({ titleKey, authorKey, isbnKey }, session) => {
  if (isbnKey) {
    const byIsbn = await BookRequest.findOne({ isOpen: true, isbnKey }).session(session);
    if (byIsbn) return byIsbn;
  }

  const sameTitle = await BookRequest.find({ isOpen: true, titleKey })
    .sort({ followerCount: -1 })
    .session(session);

  if (!sameTitle.length) return null;
  if (!authorKey) return sameTitle[0];

  return (
    sameTitle.find((r) => r.authorKey === authorKey) || sameTitle.find((r) => !r.authorKey) || null
  );
};

const assertFollowLimit = async (userId, session) => {
  const following = await BookRequest.countDocuments({
    isOpen: true,
    "followers.user": userId,
  }).session(session);

  if (following >= policy.maxOpenFollows) {
    throw new ErrorResponse(
      `You're already following ${policy.maxOpenFollows} open requests. Leave one before adding another.`,
      400,
    );
  }
};

const isFollowing = (requestId, userId, session) =>
  BookRequest.exists({ _id: requestId, "followers.user": userId }).session(session);

/**
 * Email everyone following a request once the change has committed. Skips
 * blocked users and anyone who turned email notifications off. (Phase 4 adds
 * in-app + socket notifications here as well.)
 */
const notifyFollowers = (followers, title, message) => {
  const userIds = followers.map((f) => f.user);
  if (!userIds.length) return;

  afterCommit(async () => {
    const [users, optedOut] = await Promise.all([
      User.find({ _id: { $in: userIds }, isBlocked: { $ne: true } })
        .select("email")
        .lean(),
      Preferences.find({ userId: { $in: userIds }, "notifications.email": false })
        .select("userId")
        .lean(),
    ]);

    const skip = new Set(optedOut.map((p) => String(p.userId)));
    notifyUsers(
      users.filter((u) => !skip.has(String(u._id))).map((u) => u.email),
      title,
      message,
    );
  });
};

const closeRequest = (request, status, note) => {
  request.status = status;
  request.isOpen = OPEN_STATUSES.includes(status);
  request.closedAt = request.isOpen ? undefined : new Date();
  if (note !== undefined) request.statusNote = note;
  request.history.push({ status, note });
};

// --- User

/**
 * Ask for a book. If someone already asked for the same book, the user joins
 * that request instead (one request per book, with a follower count). If the
 * book is already in the catalogue nothing is created.
 */
export const createRequest = async (body, userId, session = null) => {
  const { fields, keys } = readFields(body);

  const inLibrary = await findInCatalog(fields, keys, session);
  if (inLibrary) return { alreadyInLibrary: inLibrary };

  const match = await findOpenMatch(keys, session);
  if (match) {
    // Fill in details the first requester didn't know.
    if (!match.authorKey && keys.authorKey) {
      match.author = fields.author;
      match.authorKey = keys.authorKey;
    }
    if (!match.isbnKey && keys.isbnKey) {
      match.isbn = fields.isbn;
      match.isbnKey = keys.isbnKey;
    }
    if (match.isModified()) await match.save({ session });

    const result = await followRequest(match._id, userId, fields.note, session);
    return { ...result, joined: true };
  }

  await assertFollowLimit(userId, session);

  const request = new BookRequest({
    ...helper.pick(fields, ["title", "author", "isbn", "language"]),
    ...keys,
    requestedBy: userId,
    followers: [{ user: userId, note: fields.note }],
    followerCount: 1,
  });

  try {
    await request.save({ session });
  } catch (err) {
    // Someone created the same request a moment ago.
    if (err.code === 11000) {
      throw new ErrorResponse(
        "This book was just requested by someone else. Please try again.",
        409,
      );
    }
    throw err;
  }

  audit("book_request.create", {
    target: { type: "BookRequest", id: request._id },
    metadata: { title: request.title, author: request.author, isbn: request.isbn },
  });

  return { request: toPublic(request, true), joined: false };
};

/** Join ("+1") an open request to be told when it's added. */
export const followRequest = async (requestId, userId, note, session = null) => {
  const request = await BookRequest.findById(requestId).session(session);
  if (!request) throw new ErrorResponse("Book request not found", 404);

  if (await isFollowing(request._id, userId, session)) {
    return { request: toPublic(request, true), alreadyFollowing: true };
  }

  if (!request.isOpen) {
    const hint =
      request.status === "merged" && request.mergedInto
        ? ` It was combined with request ${request.mergedInto}.`
        : "";
    throw new ErrorResponse(`This request is closed (${request.status}).${hint}`, 400);
  }

  await assertFollowLimit(userId, session);

  const updated = await BookRequest.findOneAndUpdate(
    { _id: request._id, isOpen: true, "followers.user": { $ne: userId } },
    {
      $push: {
        followers: { user: userId, note: typeof note === "string" ? note.trim() : undefined },
      },
      $inc: { followerCount: 1 },
    },
    { new: true, session, runValidators: true },
  );
  if (!updated) {
    throw new ErrorResponse("This request just changed. Please try again.", 409);
  }

  audit("book_request.follow", {
    target: { type: "BookRequest", id: updated._id },
    metadata: { title: updated.title, followerCount: updated.followerCount },
  });

  return { request: toPublic(updated, true), alreadyFollowing: false };
};

/** Stop following. A request nobody follows any more is withdrawn. */
export const unfollowRequest = async (requestId, userId, session = null) => {
  const updated = await BookRequest.findOneAndUpdate(
    { _id: requestId, isOpen: true, "followers.user": userId },
    { $pull: { followers: { user: userId } }, $inc: { followerCount: -1 } },
    { new: true, session },
  );
  if (!updated) {
    throw new ErrorResponse("You're not following this open request.", 404);
  }

  if (updated.followerCount <= 0) {
    closeRequest(updated, "withdrawn");
    updated.followerCount = 0;
    await updated.save({ session });
  }

  audit("book_request.unfollow", {
    target: { type: "BookRequest", id: updated._id },
    metadata: { title: updated.title, followerCount: updated.followerCount },
  });

  return toPublic(updated, false);
};

/**
 * Community list: open + fulfilled requests, most wanted first. Logged-in users
 * also see which ones they follow.
 * Query: search, status, language, sort (popular|newest|oldest), page, limit.
 */
export const getCommunityRequests = async (req, userId) => {
  const status = PUBLIC_STATUSES.includes(req.query.status)
    ? req.query.status
    : { $in: OPEN_STATUSES };

  const data = await helper.paginate(BookRequest, req, {
    sort: LIST_SORTS[req.query.sort] || LIST_SORTS.popular,
    searchFields: ["title", "author", "isbn"],
    filterFields: ["language"],
    filters: { status },
    select: PUBLIC_FIELDS,
    populate: BOOK_POPULATE,
  });

  if (userId && data.results.length) {
    const mine = await BookRequest.find({
      _id: { $in: data.results.map((r) => r._id) },
      "followers.user": userId,
    }).distinct("_id");
    const set = new Set(mine.map(String));
    data.results = data.results.map((r) => ({ ...r, following: set.has(String(r._id)) }));
  }

  return data;
};

export const getRequest = async (requestId, userId) => {
  const request = await BookRequest.findById(requestId)
    .select(PUBLIC_FIELDS)
    .populate(BOOK_POPULATE)
    .lean();
  if (!request) throw new ErrorResponse("Book request not found", 404);

  const following = userId ? Boolean(await isFollowing(request._id, userId)) : undefined;
  return toPublic(request, following);
};

/** Every request the user asked for or joined, with its status timeline. */
export const getMyRequests = (req) =>
  helper.paginate(BookRequest, req, {
    sort: { updatedAt: -1 },
    filterFields: ["status"],
    filters: { "followers.user": req.userID },
    select: PUBLIC_FIELDS,
    populate: BOOK_POPULATE,
  });

// --- Admin

export const getAdminRequests = (req) =>
  helper.paginate(BookRequest, req, {
    sort: LIST_SORTS[req.query.sort] || LIST_SORTS.popular,
    searchFields: ["title", "author", "isbn"],
    filterFields: ["status", "language"],
    select: "-titleKey -authorKey -isbnKey",
    populate: [{ path: "requestedBy", select: "name email" }, BOOK_POPULATE],
  });

/** Full request, including who follows it and their notes. */
export const getAdminRequest = async (requestId) => {
  const request = await BookRequest.findById(requestId)
    .select("+followers")
    .populate([
      { path: "requestedBy", select: "name email" },
      { path: "followers.user", select: "name email" },
      BOOK_POPULATE,
      { path: "mergedInto", select: "title author status" },
    ])
    .lean();
  if (!request) throw new ErrorResponse("Book request not found", 404);
  return request;
};

const loadOpenForAdmin = async (requestId, session) => {
  const request = await BookRequest.findById(requestId).select("+followers").session(session);
  if (!request) throw new ErrorResponse("Book request not found", 404);
  if (!request.isOpen) {
    throw new ErrorResponse(`This request is already closed (${request.status}).`, 400);
  }
  return request;
};

const STATUS_MESSAGES = {
  open: (t) => `Your request for "${t}" is back in the queue.`,
  reviewing: (t) => `We're looking into "${t}". We'll let you know what we find.`,
  planned: (t) =>
    `Good news: "${t}" is planned for the library. We'll tell you the moment it's available.`,
  rejected: (t) => `We're sorry, we can't add "${t}" to the library right now.`,
};

/** Body: { status: open|reviewing|planned|rejected, note? } (note required to reject). */
export const updateStatus = async (requestId, { status, note } = {}, session = null) => {
  if (!ADMIN_STATUSES.includes(status)) {
    throw new ErrorResponse(`Status must be one of: ${ADMIN_STATUSES.join(", ")}.`, 400);
  }
  const cleanNote = typeof note === "string" && note.trim() ? note.trim() : undefined;
  if (status === "rejected" && !cleanNote) {
    throw new ErrorResponse("Please give a reason (note) when rejecting a request.", 400);
  }

  const request = await loadOpenForAdmin(requestId, session);
  const from = request.status;
  if (from === status && !cleanNote) return toPublic(request);

  closeRequest(request, status, cleanNote);
  await request.save({ session });

  audit("admin.book_request.status", {
    target: { type: "BookRequest", id: request._id },
    metadata: { title: request.title, from, to: status, note: cleanNote },
  });

  const message = STATUS_MESSAGES[status](request.title);
  notifyFollowers(
    request.followers,
    `Update on your book request`,
    cleanNote ? `${message} ${status === "rejected" ? "Reason" : "Note"}: ${cleanNote}` : message,
  );

  return toPublic(request);
};

/** Link the request to a published book and tell every follower it's here. */
export const fulfillRequest = async (requestId, { bookId, note } = {}, session = null) => {
  if (!bookId) throw new ErrorResponse("bookId is required", 400);

  const book = await Book.findById(bookId).select("title status").session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);
  if (book.status !== "published") {
    throw new ErrorResponse("Publish the book before marking the request as fulfilled.", 400);
  }

  const request = await loadOpenForAdmin(requestId, session);
  const cleanNote = typeof note === "string" && note.trim() ? note.trim() : undefined;

  request.book = book._id;
  closeRequest(request, "fulfilled", cleanNote);
  await request.save({ session });

  audit("admin.book_request.fulfill", {
    target: { type: "BookRequest", id: request._id },
    metadata: { title: request.title, bookId: book._id, followers: request.followerCount },
  });

  notifyFollowers(
    request.followers,
    `"${book.title}" is now in the library`,
    `The book you asked for, "${book.title}", has been added. You can rent it now from the catalogue.${cleanNote ? ` ${cleanNote}` : ""}`,
  );

  return toPublic(request);
};

/**
 * Fold a duplicate the automatic matching missed (typo, other spelling) into
 * another request. Its followers move over; it is closed as "merged".
 */
export const mergeRequest = async (requestId, intoId, session = null) => {
  if (!intoId) throw new ErrorResponse("intoId is required", 400);
  if (String(requestId) === String(intoId)) {
    throw new ErrorResponse("A request can't be merged into itself.", 400);
  }

  const source = await loadOpenForAdmin(requestId, session);
  const target = await loadOpenForAdmin(intoId, session);

  const already = new Set(target.followers.map((f) => String(f.user)));
  const moving = source.followers.filter((f) => !already.has(String(f.user)));

  target.followers.push(
    ...moving.map((f) => ({ user: f.user, note: f.note, joinedAt: f.joinedAt })),
  );
  target.followerCount = target.followers.length;
  if (!target.isbnKey && source.isbnKey) {
    target.isbn = source.isbn;
    target.isbnKey = source.isbnKey;
  }

  source.mergedInto = target._id;
  closeRequest(source, "merged", `Combined with "${target.title}".`);

  await source.save({ session });
  await target.save({ session });

  audit("admin.book_request.merge", {
    target: { type: "BookRequest", id: source._id },
    metadata: { from: source.title, into: target.title, intoId: target._id, moved: moving.length },
  });

  notifyFollowers(
    moving,
    `Update on your book request`,
    `Your request for "${source.title}" has been combined with "${target.title}". You'll get its updates from now on.`,
  );

  return toPublic(target);
};
