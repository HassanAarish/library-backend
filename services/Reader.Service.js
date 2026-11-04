import { v2 as cloudinary } from "cloudinary";
import NodeCache from "node-cache";
import Book from "../models/Book.Model.js";
import Rental from "../models/Rental.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import cache from "../utils/cache.js";
import { audit } from "../utils/audit.js";
import { watermarkPage } from "../utils/watermark.js";

const PAGE_WIDTH = 1200; // px — readable on desktop, still light on mobile data
const FETCH_TIMEOUT_MS = 15000;

// Un-watermarked page renders, shared by every reader of a book. Buffers are
// stored by reference (no cloning) and capped so memory stays bounded.
const pageCache = new NodeCache({
  stdTTL: 10 * 60,
  checkperiod: 120,
  useClones: false,
  maxKeys: 300,
});

// Reading the same book from many networks in a short window is a sign of a
// shared account or a scraping setup.
const IP_WINDOW_SECONDS = 30 * 60;
const MAX_IPS_PER_WINDOW = 3;

/**
 * The rental (if any) that lets `userId` read `bookId` right now. Access is
 * decided by the dates themselves, not by a cron-maintained status alone, so a
 * late job can never extend or cut short anyone's reading time.
 */
const findActiveRental = (userId, bookId) => {
  const now = new Date();
  return Rental.findOne({
    bookId,
    renterId: userId,
    status: "active",
    rentalDate: { $lte: now },
    expiryDate: { $gt: now },
  })
    .select("_id expiryDate")
    .lean();
};

/**
 * Load a book and check the caller may read it. Admins can read any book
 * (including drafts) to proof it; everyone else needs a live rental of a
 * published book.
 */
const authorizeReader = async ({ userId, role }, bookId) => {
  const book = await Book.findById(bookId).select("+file").lean();
  const isAdmin = role === "admin";

  if (!book || (!isAdmin && book.status !== "published")) {
    throw new ErrorResponse("Book not found", 404);
  }

  if (isAdmin) return { book, rental: null };

  const rental = await findActiveRental(userId, bookId);
  if (!rental) {
    audit("reader.denied", {
      outcome: "failure",
      target: { type: "Book", id: bookId },
      metadata: { reason: "no_active_rental" },
    });
    throw new ErrorResponse("Rent this book to start reading.", 403);
  }

  return { book, rental };
};

const maskEmail = (email = "") => {
  const [name, domain] = String(email).split("@");
  if (!domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
};

const watermarkLabel = ({ userId, email }) => {
  const stamp = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    dateStyle: "short",
    timeStyle: "short",
  });
  return `LibraryHub · ${userId} · ${maskEmail(email)} · ${stamp}`;
};

/**
 * Flag (never auto-block) a reader seen on too many networks. Raised at most
 * once per window per user+book. The admin reviews flags in the audit log.
 */
const trackReaderNetwork = async ({ userId, ip }, bookId) => {
  if (!ip) return;

  const key = `reader:ips:${userId}:${bookId}`;
  const ips = new Set((await cache.get(key)) || []);
  if (ips.has(ip)) return;

  ips.add(ip);
  await cache.set(key, [...ips], IP_WINDOW_SECONDS);

  const flagKey = `reader:flagged:ips:${userId}:${bookId}`;
  if (ips.size > MAX_IPS_PER_WINDOW && !(await cache.get(flagKey))) {
    await cache.set(flagKey, true, IP_WINDOW_SECONDS);
    audit("reader.suspicious", {
      outcome: "failure",
      severity: "critical",
      target: { type: "Book", id: bookId },
      metadata: { reason: "many_networks", ips: [...ips], windowMinutes: IP_WINDOW_SECONDS / 60 },
    });
  }
};

// Server-signed URL for one rendered page of a private PDF. Never sent to clients.
const pageSourceUrl = (publicId, page) =>
  cloudinary.url(publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    format: "jpg",
    transformation: [{ page, width: PAGE_WIDTH, crop: "limit", quality: "auto:good" }],
  });

const fetchPage = async (publicId, page) => {
  const cacheKey = `${publicId}:${page}`;
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  let response;
  try {
    response = await fetch(pageSourceUrl(publicId, page), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Page fetch failed:", err.message);
    throw new ErrorResponse("Couldn't load this page right now. Please try again.", 502);
  }

  if (!response.ok) {
    console.error(`Page fetch failed: ${response.status} for ${publicId} p${page}`);
    throw new ErrorResponse("Couldn't load this page right now. Please try again.", 502);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    pageCache.set(cacheKey, buffer);
  } catch {
    // Cache full — serve uncached rather than fail.
  }

  return buffer;
};

/**
 * Open a book in the reader: returns what the viewer needs to lay out pages.
 * Logged as "reader.open" — one entry per reading session start.
 */
export const openBook = async (reader, bookId) => {
  const { book, rental } = await authorizeReader(reader, bookId);

  audit("reader.open", { target: { type: "Book", id: bookId }, metadata: { title: book.title } });

  return {
    bookId: book._id,
    title: book.title,
    author: book.author,
    pageCount: book.pageCount,
    accessUntil: rental?.expiryDate ?? null,
  };
};

/**
 * One page of a book as a watermarked JPEG.
 *
 * @param {{ userId: string, role: string, email: string, ip: string }} reader
 * @param {string} bookId
 * @param {string|number} pageParam - 1-based page number
 * @returns {Promise<Buffer>}
 */
export const getPage = async (reader, bookId, pageParam) => {
  const { book } = await authorizeReader(reader, bookId);

  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1 || page > (book.pageCount || 0)) {
    throw new ErrorResponse(`Page must be between 1 and ${book.pageCount}.`, 400);
  }

  if (reader.role !== "admin") {
    trackReaderNetwork(reader, bookId).catch((err) =>
      console.error("Reader tracking failed:", err.message),
    );
  }

  const source = await fetchPage(book.file.public_id, page);
  return watermarkPage(source, watermarkLabel(reader));
};
