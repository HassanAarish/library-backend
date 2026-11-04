import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import * as readerController from "../controller/Reader.Controller.js";

const router = express.Router();

// A person turns pages at human speed; pulling 40+ pages a minute from one
// book looks like scraping. The reader is throttled and flagged (critical) for
// the admin to review — not blocked automatically.
const pageLimiter = createLimiter({
  keyPrefix: "rl_reader_pages",
  points: 40,
  duration: 60,
  key: (req) => `${req.userID}:${req.params.bookId}`,
  flag: { action: "reader.suspicious", severity: "critical" },
});

router.get("/:bookId", verifyToken, readerController.openBook);

router.get("/:bookId/pages/:page", verifyToken, pageLimiter, readerController.getPage);

export default router;
