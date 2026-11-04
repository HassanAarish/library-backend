/**
 * One-off migration of existing books to the admin-only catalogue model.
 *
 *   node scripts/migrate-books-v2.js                 # dry run: prints what would change
 *   node scripts/migrate-books-v2.js --apply         # update the database
 *   node scripts/migrate-books-v2.js --apply --move-files
 *        # also make each PDF private on Cloudinary and record its page count
 *
 * Field changes: status approved→published, pending→draft, rejected→archived;
 * uploader→createdBy; drops isAvailable, rejectionReason and file.url; fills
 * currency (PKR) and rentalDays (14). Afterwards Category.bookCount is recomputed
 * from published books.
 *
 * Books whose file isn't a PDF (old DOCX/EPUB uploads) can't be paged by the
 * reader: they're reported, moved to draft, and need a new PDF uploaded.
 */
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "../config/dotenv.js";

const APPLY = process.argv.includes("--apply");
const MOVE_FILES = process.argv.includes("--move-files");

const STATUS_MAP = { approved: "published", pending: "draft", rejected: "archived" };

cloudinary.config({
  cloud_name: getEnv("CLOUDINARY_CLOUD_NAME"),
  api_key: getEnv("CLOUDINARY_API_KEY"),
  api_secret: getEnv("CLOUDINARY_API_SECRET"),
});

const makeFilePrivate = async (publicId) => {
  try {
    await cloudinary.uploader.rename(publicId, publicId, {
      resource_type: "image",
      type: "upload",
      to_type: "authenticated",
      invalidate: true,
    });
  } catch (err) {
    // Already private from an earlier run is fine.
    if (!/not found/i.test(err?.error?.message || err?.message || "")) throw err;
  }

  const resource = await cloudinary.api.resource(publicId, {
    resource_type: "image",
    type: "authenticated",
    pages: true,
  });
  return resource.pages;
};

const run = async () => {
  await mongoose.connect(getEnv("MONGO_URI"));
  const books = mongoose.connection.db.collection("books");
  const categories = mongoose.connection.db.collection("categories");

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"}${MOVE_FILES ? " + moving files" : ""}\n`);

  const needsNewPdf = [];

  for (const book of await books.find({}).toArray()) {
    const set = {};
    const unset = {};

    const status = STATUS_MAP[book.status] || book.status;
    if (status !== book.status) set.status = status;

    if (!book.createdBy && book.uploader) set.createdBy = book.uploader;
    for (const field of ["uploader", "isAvailable", "rejectionReason", "file.url"]) {
      const [top, sub] = field.split(".");
      if (sub ? book[top]?.[sub] !== undefined : book[top] !== undefined) unset[field] = "";
    }

    if (!book.currency) set.currency = "PKR";
    if (!book.rentalDays) set.rentalDays = 14;
    if (!Number.isInteger(book.price)) set.price = Math.round(book.price || 0);

    const isPdf = /\.pdf$/i.test(book.file?.name || "") || book.file?.format === "pdf";
    if (!isPdf) {
      needsNewPdf.push(`${book._id}  ${book.title}`);
      if ((set.status || book.status) === "published") set.status = "draft";
    } else if (MOVE_FILES && book.file?.public_id && !book.pageCount) {
      if (APPLY) {
        const pages = await makeFilePrivate(book.file.public_id);
        set.pageCount = pages;
        set["file.pages"] = pages;
      } else {
        set.pageCount = "(fetched from Cloudinary)";
      }
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) continue;

    console.log(`• ${book._id}  ${book.title}`);
    if (Object.keys(set).length) console.log("    set:  ", set);
    if (Object.keys(unset).length) console.log("    unset:", Object.keys(unset).join(", "));

    if (APPLY) {
      await books.updateOne(
        { _id: book._id },
        {
          ...(Object.keys(set).length && { $set: set }),
          ...(Object.keys(unset).length && { $unset: unset }),
        },
      );
    }
  }

  // Category counts = published books.
  const counts = await books
    .aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ])
    .toArray();
  const countById = new Map(counts.map((c) => [String(c._id), c.n]));

  for (const category of await categories.find({}).toArray()) {
    const bookCount = countById.get(String(category._id)) || 0;
    if (bookCount !== category.bookCount) {
      console.log(`• category "${category.name}": bookCount ${category.bookCount} → ${bookCount}`);
      if (APPLY) await categories.updateOne({ _id: category._id }, { $set: { bookCount } });
    }
  }

  if (needsNewPdf.length) {
    console.log(
      "\n⚠️  Not PDFs — kept as draft; upload a PDF for each via POST /book/upload-file:",
    );
    needsNewPdf.forEach((line) => console.log(`   ${line}`));
  }

  if (!MOVE_FILES) {
    console.log("\nℹ️  Files were not moved. Run again with --move-files to make PDFs private.");
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
