import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import validate from "../middlewares/validate.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import { importCover } from "../validators/Book.Validator.js";
import * as lookupController from "../controller/Lookup.Controller.js";

const router = express.Router();

// Each search may call Open Library; keep it to typing speed per user.
const lookupLimiter = createLimiter({
  keyPrefix: "rl_lookup",
  points: 30,
  duration: 60,
  key: (req) => String(req.userID),
});

// Signed-in users (book-request suggestions) and the admin (Add book autofill).
// ?q=title or author  |  ?isbn=9780735211292   (&limit=1-20)
router.get("/books", verifyToken, lookupLimiter, lookupController.searchBooks);

// Description + subjects of one Open Library work, e.g. /lookup/books/OL45804W
router.get("/books/:workKey", verifyToken, lookupLimiter, lookupController.getWork);

// Admin: copy an Open Library cover into our storage. Body: { coverId }
router.post(
  "/cover",
  verifyToken,
  verifyRole("admin"),
  validate(importCover),
  lookupController.importCover,
);

export default router;
