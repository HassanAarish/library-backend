import Book from "../models/Book.Model.js";
import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { getOwnedAsset } from "./Common.Service.js";

// Plain metadata the admin may set directly.
const EDITABLE_FIELDS = [
  "title",
  "author",
  "description",
  "language",
  "isbn",
  "publishedYear",
  "price",
  "rentalDays",
];

const STATUSES = ["draft", "published", "archived"];

// Public catalogue sort options (?sort=…).
const CATALOG_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1, createdAt: -1 },
  price_desc: { price: -1, createdAt: -1 },
  title: { title: 1 },
};

const PUBLIC_POPULATE = { path: "category", select: "name slug" };

// Category.bookCount counts PUBLISHED books only.
const adjustCategoryCount = (categoryId, delta, session) =>
  Category.findByIdAndUpdate(categoryId, { $inc: { bookCount: delta } }, { session });

const assertApprovedCategory = async (categoryId, session) => {
  const category = await Category.findById(categoryId).session(session);
  if (!category || category.status !== "approved") {
    throw new ErrorResponse("Invalid or unapproved category selected.", 400);
  }
  return category;
};

// The book PDF must be a private upload made by this admin via /book/upload-file.
const getBookFileAsset = async (publicId, adminId) => {
  const asset = await getOwnedAsset(publicId, adminId, { mimePrefix: "application/pdf" });

  if (asset.deliveryType !== "authenticated") {
    throw new ErrorResponse("Book files must be uploaded through /book/upload-file.", 400);
  }
  return asset;
};

const toBookFile = (asset) => ({
  public_id: asset.public_id,
  name: asset.name,
  format: asset.format || "pdf",
  pages: asset.pages,
  bytes: asset.bytes,
});

const toCover = (asset) => ({ name: asset.name, url: asset.url, public_id: asset.public_id });

export const createBook = async (body, adminId, session = null) => {
  const { categoryId, file, coverImage, status = "draft" } = body;

  if (!STATUSES.includes(status) || status === "archived") {
    throw new ErrorResponse("A new book can only be saved as draft or published.", 400);
  }

  await assertApprovedCategory(categoryId, session);

  const [fileAsset, coverAsset] = await Promise.all([
    getBookFileAsset(file?.public_id, adminId),
    getOwnedAsset(coverImage?.public_id, adminId, { mimePrefix: "image/" }),
  ]);

  const book = new Book({
    ...helper.pick(body, EDITABLE_FIELDS),
    category: categoryId,
    file: toBookFile(fileAsset),
    pageCount: fileAsset.pages,
    coverImage: toCover(coverAsset),
    status,
    createdBy: adminId,
  });

  const saved = await book.save({ session });

  if (status === "published") {
    await adjustCategoryCount(categoryId, 1, session);
  }

  audit("admin.book.create", {
    target: { type: "Book", id: saved._id },
    metadata: { title: saved.title, price: saved.price, status, categoryId },
  });

  return saved;
};

export const updateBook = async (bookId, body, adminId, session = null) => {
  const book = await Book.findById(bookId).select("+file").session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);

  const changes = helper.pick(body, EDITABLE_FIELDS);
  const before = helper.pick(book.toObject(), Object.keys(changes));

  // Moving categories keeps both categories' published counts right.
  if (body.categoryId && String(body.categoryId) !== String(book.category)) {
    await assertApprovedCategory(body.categoryId, session);

    if (book.status === "published") {
      await adjustCategoryCount(book.category, -1, session);
      await adjustCategoryCount(body.categoryId, 1, session);
    }

    before.category = book.category;
    changes.category = body.categoryId;
  }

  // Replaced files are kept on Cloudinary (a failed commit must not leave the
  // book pointing at a deleted file); clean them up later via /common/remove.
  if (body.file?.public_id && body.file.public_id !== book.file?.public_id) {
    const fileAsset = await getBookFileAsset(body.file.public_id, adminId);
    before.file = book.file?.public_id;
    changes.file = toBookFile(fileAsset);
    changes.pageCount = fileAsset.pages;
  }

  if (body.coverImage?.public_id && body.coverImage.public_id !== book.coverImage?.public_id) {
    const coverAsset = await getOwnedAsset(body.coverImage.public_id, adminId, {
      mimePrefix: "image/",
    });
    before.coverImage = book.coverImage?.public_id;
    changes.coverImage = toCover(coverAsset);
  }

  book.set(changes);
  const saved = await book.save({ session });

  audit("admin.book.update", {
    target: { type: "Book", id: book._id },
    metadata: {
      before,
      after: {
        ...changes,
        file: changes.file?.public_id,
        coverImage: changes.coverImage?.public_id,
      },
    },
  });

  return saved;
};

export const setBookStatus = async (bookId, status, session = null) => {
  if (!STATUSES.includes(status)) {
    throw new ErrorResponse(`Status must be one of: ${STATUSES.join(", ")}.`, 400);
  }

  const book = await Book.findById(bookId).session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);

  const previousStatus = book.status;
  if (previousStatus === status) return book;

  if (status === "published" && !book.pageCount) {
    throw new ErrorResponse("This book's file has no page count; re-upload the PDF first.", 400);
  }

  book.status = status;
  const saved = await book.save({ session });

  if (status === "published") {
    await adjustCategoryCount(book.category, 1, session);
  } else if (previousStatus === "published") {
    await adjustCategoryCount(book.category, -1, session);
  }

  audit("admin.book.status", {
    target: { type: "Book", id: book._id },
    metadata: { title: book.title, from: previousStatus, to: status },
  });

  return saved;
};

/**
 * Public catalogue: published books only, cover + metadata. The file is never
 * included (select: false on the model).
 * Query: search, category, language, sort (newest|oldest|price_asc|price_desc|title), page, limit.
 */
export const getCatalog = async (req) => {
  return helper.paginate(Book, req, {
    sort: CATALOG_SORTS[req.query.sort] || CATALOG_SORTS.newest,
    searchFields: ["title", "author"],
    filterFields: ["category", "language"],
    filters: { status: "published" },
    select: "-createdBy",
    populate: PUBLIC_POPULATE,
  });
};

export const getBook = async (bookId) => {
  const book = await Book.findOne({ _id: bookId, status: "published" })
    .select("-createdBy")
    .populate(PUBLIC_POPULATE)
    .lean();

  if (!book) throw new ErrorResponse("Book not found", 404);
  return book;
};

/** Admin view: every status, including the (URL-less) file metadata. */
export const getAdminBooks = async (req) => {
  return helper.paginate(Book, req, {
    sort: { createdAt: -1 },
    searchFields: ["title", "author", "isbn"],
    filterFields: ["status", "category", "language"],
    select: "+file",
    populate: PUBLIC_POPULATE,
  });
};

export const getAdminBook = async (bookId) => {
  const book = await Book.findById(bookId)
    .select("+file")
    .populate(PUBLIC_POPULATE)
    .populate({ path: "createdBy", select: "name email" })
    .lean();

  if (!book) throw new ErrorResponse("Book not found", 404);
  return book;
};
