import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import readerPolicy from "../config/readerPolicy.js";
import * as readerController from "../controller/Reader.Controller.js";

const router = express.Router();

// A person turns pages at human speed; pulling pages much faster than that from
// one book looks like scraping. The reader is throttled and flagged (critical)
// for the admin to review.
const pageLimiter = createLimiter({
  keyPrefix: "rl_reader_pages",
  points: readerPolicy.pagesPerMinute,
  duration: 60,
  key: (req) => `${req.userID}:${req.params.bookId}`,
  flag: { action: "reader.suspicious", severity: "critical" },
});

router.get("/:bookId", verifyToken, readerController.openBook);

router.get("/:bookId/pages/:page", verifyToken, pageLimiter, readerController.getPage);

export default router;
