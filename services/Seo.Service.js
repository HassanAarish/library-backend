import Book from "../models/Book.Model.js";
import { getEnv } from "../config/dotenv.js";

// Public pages of the frontend worth indexing (account/admin/reader are not).
const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/books", priority: "0.9", changefreq: "daily" },
  { path: "/plans", priority: "0.7", changefreq: "monthly" },
  { path: "/requests", priority: "0.6", changefreq: "daily" },
  { path: "/contact", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy", priority: "0.2", changefreq: "yearly" },
  { path: "/terms", priority: "0.2", changefreq: "yearly" },
];

const escapeXml = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c],
  );

/**
 * sitemap.xml for the frontend: the public pages plus every published book.
 * URLs point at CLIENT_URL (the site readers visit), not at the API.
 */
export const buildSitemap = async () => {
  const site = (getEnv("CLIENT_URL") || "http://localhost:5173").replace(/\/+$/, "");
  const books = await Book.find({ status: "published" })
    .select("_id updatedAt")
    .sort({ updatedAt: -1 })
    .limit(45_000) // one sitemap file holds at most 50,000 URLs
    .lean();

  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: site + p.path, ...p })),
    ...books.map((b) => ({
      loc: `${site}/books/${b._id}`,
      lastmod: b.updatedAt && new Date(b.updatedAt).toISOString().slice(0, 10),
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};
