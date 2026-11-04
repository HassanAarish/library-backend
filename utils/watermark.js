import sharp from "sharp";

const escapeXml = (text) =>
  String(text).replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c],
  );

/**
 * Stamp a page image with the reader's identity: a faint diagonal pattern
 * across the whole page (hard to crop out) plus a small footer line. Any leaked
 * screenshot or scrape can then be traced back to the account that read it.
 *
 * Text is rendered by librsvg, which needs at least one system font — on a slim
 * Linux server image install one (e.g. `fonts-dejavu-core`).
 *
 * @param {Buffer} image - the page (any format sharp reads)
 * @param {string} label - e.g. "LibraryHub · <userId> · ab***@gmail.com · 2026-11-04 14:05"
 * @returns {Promise<Buffer>} JPEG
 */
export const watermarkPage = async (image, label) => {
  const { width = 1200, height = 1600 } = await sharp(image).metadata();

  const fontSize = Math.max(14, Math.round(width / 45));
  const text = escapeXml(label);
  const line = `${text}     ${text}     ${text}`;

  // Rows over an oversized area so the rotated pattern still covers the corners.
  const rows = [];
  for (let y = -height; y < height * 2; y += fontSize * 7) {
    rows.push(`<text x="${-width}" y="${y}">${line}</text>`);
  }

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(-30 ${width / 2} ${height / 2})"
         fill="#000" fill-opacity="0.09" font-size="${fontSize}" font-family="DejaVu Sans, Arial, sans-serif">
        ${rows.join("")}
      </g>
      <text x="${width / 2}" y="${height - fontSize}" text-anchor="middle"
            fill="#000" fill-opacity="0.45" font-size="${Math.round(fontSize * 0.7)}"
            font-family="DejaVu Sans, Arial, sans-serif">${text}</text>
    </svg>`;

  return sharp(image)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
};
