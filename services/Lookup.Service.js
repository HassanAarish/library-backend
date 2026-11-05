import { getEnv } from "../config/dotenv.js";
import ErrorResponse from "../utils/errorResponse.js";
import cache from "../utils/cache.js";
import { audit } from "../utils/audit.js";
import { importImageFromUrl } from "./Common.Service.js";

/**
 * Book details from Open Library (openlibrary.org, Internet Archive): free
 * metadata (CC0) for millions of books. Used to auto-fill the admin's
 * "Add book" form and book-request suggestions. Only metadata and cover images
 * come from here; the readable PDF is always the admin's own upload.
 *
 * Open Library asks API users to send a descriptive User-Agent with a contact
 * address and to cache results; both are done here.
 */

const BASE = "https://openlibrary.org";
const COVERS = "https://covers.openlibrary.org/b/id";
const TIMEOUT_MS = 8000;
const SEARCH_TTL = 60 * 60; // 1 hour
const WORK_TTL = 24 * 60 * 60; // 1 day

const SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "isbn",
  "language",
  "cover_i",
  "number_of_pages_median",
  "subject",
].join(",");

// Open Library uses MARC language codes.
const LANGUAGES = {
  eng: "English",
  urd: "Urdu",
  ara: "Arabic",
  hin: "Hindi",
  per: "Persian",
  pan: "Punjabi",
};

const userAgent = () => {
  const contact = getEnv("OPENLIBRARY_CONTACT") || getEnv("EMAIL");
  return `LibraryHub/1.0${contact ? ` (${contact})` : ""}`;
};

const fetchJson = async (path) => {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ErrorResponse("Open Library didn't respond. Please try again.", 502);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ErrorResponse("Open Library returned an error. Please try again.", 502);
  return res.json();
};

export const coverUrl = (coverId, size = "L") =>
  coverId ? `${COVERS}/${coverId}-${size}.jpg` : undefined;

const normalizeIsbn = (isbn) =>
  String(isbn || "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");

const pickIsbn = (list = []) =>
  list.map(normalizeIsbn).find((i) => i.length === 13) ||
  list.map(normalizeIsbn).find((i) => i.length === 10);

const toResult = (doc) => ({
  workKey: doc.key?.replace("/works/", ""),
  title: doc.subtitle ? `${doc.title}: ${doc.subtitle}` : doc.title,
  authors: doc.author_name?.slice(0, 3) ?? [],
  author: doc.author_name?.[0] ?? "",
  publishedYear: doc.first_publish_year,
  isbn: pickIsbn(doc.isbn),
  language: LANGUAGES[doc.language?.[0]] ?? undefined,
  pageCount: doc.number_of_pages_median,
  subjects: doc.subject?.slice(0, 8) ?? [],
  coverId: doc.cover_i,
  coverUrl: coverUrl(doc.cover_i, "M"),
});

/**
 * Search by free text (title/author) or ISBN. Returns up to `limit` matches.
 * @param {{ q?: string, isbn?: string, limit?: number }} params
 */
export const searchBooks = async ({ q, isbn, limit = 8 } = {}) => {
  const isbnKey = normalizeIsbn(isbn);
  const text = typeof q === "string" ? q.trim() : "";

  if (!isbnKey && text.length < 2) {
    throw new ErrorResponse("Type at least 2 characters, or an ISBN.", 400);
  }
  if (isbn && ![10, 13].includes(isbnKey.length)) {
    throw new ErrorResponse("ISBN must have 10 or 13 digits.", 400);
  }

  const size = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const query = isbnKey ? `isbn:${isbnKey}` : text;
  const key = `openlibrary:search:${query.toLowerCase()}:${size}`;

  return cache.wrap(key, SEARCH_TTL, async () => {
    const params = new URLSearchParams({ q: query, limit: String(size), fields: SEARCH_FIELDS });
    const data = await fetchJson(`/search.json?${params}`);
    return (data?.docs ?? []).filter((d) => d.title).map(toResult);
  });
};

const WORK_KEY = /^OL\d+W$/;

/** Description and subjects of one work (search results don't include the description). */
export const getWork = async (workKey) => {
  if (!WORK_KEY.test(workKey)) throw new ErrorResponse("Invalid Open Library work id.", 400);

  return cache.wrap(`openlibrary:work:${workKey}`, WORK_TTL, async () => {
    const work = await fetchJson(`/works/${workKey}.json`);
    if (!work) throw new ErrorResponse("Book not found on Open Library.", 404);

    const description =
      typeof work.description === "string" ? work.description : work.description?.value;

    return {
      workKey,
      title: work.title,
      // Open Library descriptions often end with a "([source][1])" footnote block.
      description: description
        ?.replace(/\r\n/g, "\n")
        .split(/\n-{3,}\n|\n\[1\]:/)[0]
        .trim(),
      subjects: work.subjects?.slice(0, 8) ?? [],
      coverId: work.covers?.find((c) => c > 0),
    };
  });
};

/**
 * Copy an Open Library cover into our Cloudinary as the admin's upload, ready
 * to use as a book's `coverImage`. Only numeric cover ids are accepted and the
 * URL is built here, so this can't be used to fetch arbitrary addresses.
 */
export const importCover = async (coverId, adminId) => {
  const id = Number(coverId);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorResponse("Invalid cover id.", 400);

  let asset;
  try {
    asset = await importImageFromUrl(coverUrl(id, "L"), adminId, {
      folder: "library/covers",
      name: `openlibrary-${id}.jpg`,
    });
  } catch (err) {
    if (err instanceof ErrorResponse) throw err;
    throw new ErrorResponse("Couldn't import that cover. Upload one instead.", 502);
  }

  audit("admin.book.cover_imported", {
    metadata: { source: "openlibrary", coverId: id, public_id: asset.public_id },
  });

  return asset;
};
