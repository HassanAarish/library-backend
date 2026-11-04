import Book from "../models/Book.Model.js";
import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { getOwnedAsset } from "./Common.Service.js";

export const createBookRequest = async (bookData, userId, session = null) => {
  const { categoryId, title, author, description, price, file, coverImage } = bookData;

  // 1. Validate Category exists and is approved
  const category = await Category.findById(categoryId).session(session);
  if (!category || category.status !== "approved") {
    throw new ErrorResponse("Invalid or unapproved category selected.", 400);
  }

  // 2. Both files must be uploads owned by this user; URLs come from our records.
  const [bookAsset, coverAsset] = await Promise.all([
    getOwnedAsset(file?.public_id, userId),
    getOwnedAsset(coverImage?.public_id, userId, { mimePrefix: "image/" }),
  ]);

  // 3. Create the Book — only whitelisted fields, never status/uploader from the client
  const book = new Book({
    title,
    author,
    description,
    price,
    uploader: userId,
    category: categoryId,
    file: {
      url: bookAsset.url,
      public_id: bookAsset.public_id,
      name: bookAsset.name,
      format: bookAsset.format,
    },
    coverImage: {
      url: coverAsset.url,
      public_id: coverAsset.public_id,
      name: coverAsset.name,
    },
    status: "pending",
  });

  const saved = await book.save({ session });

  audit("book.create", {
    target: { type: "Book", id: saved._id },
    metadata: { title, author, price, categoryId },
  });

  return saved;
};

export const getMyBooks = async (req, userId) => {
  const options = {
    sort: { createdAt: -1 },
    searchFields: ["title"],
    filterFields: ["status", "category"],
    filters: { uploader: userId },
    populate: { path: "category", select: "name slug" },
  };

  return await helper.paginate(Book, req, options);
};

export const getAllBooks = async (req) => {
  const options = {
    sort: { createdAt: -1 },
    searchFields: ["title", "author"],
    filterFields: ["category"],
    // Public catalogue: only approved, visible books — never overridable by the client.
    filters: { status: "approved", isAvailable: true },
    populate: [
      { path: "category", select: "name slug" },
      { path: "uploader", select: "name" },
    ],
  };

  return await helper.paginate(Book, req, options);
};

export const reviewBook = async (bookId, body, session = null) => {
  const { status, reason = "" } = body;
  const book = await Book.findById(bookId).session(session);
  if (!book) throw new ErrorResponse("Book not found", 404);

  const previousStatus = book.status;

  book.status = status;
  book.rejectionReason = status === "rejected" ? reason : undefined;

  // Keep the category's count in step with approved books only, on transitions.
  if (previousStatus !== "approved" && status === "approved") {
    await Category.findByIdAndUpdate(book.category, { $inc: { bookCount: 1 } }, { session });
  } else if (previousStatus === "approved" && status !== "approved") {
    await Category.findByIdAndUpdate(book.category, { $inc: { bookCount: -1 } }, { session });
  }

  const saved = await book.save({ session });

  audit("admin.book.review", {
    target: { type: "Book", id: book._id },
    metadata: { title: book.title, from: previousStatus, to: status, reason },
  });

  return saved;
};
