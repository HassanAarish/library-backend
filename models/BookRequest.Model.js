import mongoose from "mongoose";

// open: waiting for the admin · reviewing: admin is looking for it ·
// planned: admin will add it · fulfilled: the book is in the catalogue ·
// rejected: won't be added (with a reason) · merged: duplicate, folded into
// another request · withdrawn: every follower left.
export const REQUEST_STATUSES = [
  "open",
  "reviewing",
  "planned",
  "fulfilled",
  "rejected",
  "merged",
  "withdrawn",
];

// Statuses that still accept followers and can still change.
export const OPEN_STATUSES = ["open", "reviewing", "planned"];

const FollowerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, trim: true, maxlength: 500 },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const HistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: REQUEST_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const BookRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, trim: true, maxlength: 120, default: "" },
    isbn: { type: String, trim: true, maxlength: 20 },
    language: { type: String, trim: true, maxlength: 40 },

    // Normalised copies used to merge duplicate requests ("The Alchemist" ==
    // "alchemist"). See normalizeText in BookRequest.Service.
    titleKey: { type: String, required: true },
    authorKey: { type: String, default: "" },
    isbnKey: { type: String },

    status: { type: String, enum: REQUEST_STATUSES, default: "open" },
    // Mirrors OPEN_STATUSES.includes(status); kept as a field so the unique
    // index below can be partial on it. Always set together with status.
    isOpen: { type: Boolean, default: true },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Everyone who wants this book (the requester included). Private: never
    // returned by default, user ids are not shown to other users.
    followers: { type: [FollowerSchema], select: false },
    followerCount: { type: Number, default: 1, min: 0 },

    // Latest admin message shown to followers, plus the full timeline.
    statusNote: { type: String, trim: true, maxlength: 1000 },
    history: { type: [HistorySchema], default: () => [{ status: "open" }] },

    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book" }, // when fulfilled
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: "BookRequest" }, // when merged
    closedAt: { type: Date },
  },
  { timestamps: true },
);

// One open request per title + author; a closed one can be requested again.
BookRequestSchema.index(
  { titleKey: 1, authorKey: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } },
);
BookRequestSchema.index({ isbnKey: 1 }, { partialFilterExpression: { isOpen: true } });
BookRequestSchema.index({ "followers.user": 1, isOpen: 1 });
BookRequestSchema.index({ status: 1, followerCount: -1 });

const BookRequest = mongoose.model("BookRequest", BookRequestSchema);

export default BookRequest;
