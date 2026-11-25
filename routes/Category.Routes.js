import express from "express";
import { inTransaction } from "../middlewares/transaction.js";
import verifyToken from "../middlewares/verifyToken.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import * as categoryController from "../controller/Category.Controller.js";
import verifyRole from "../middlewares/verifyRole.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/Community.Validator.js";

const router = express.Router();

// Readers may suggest categories; each one lands in the admin's review queue.
const suggestLimiter = createLimiter({
  keyPrefix: "rl_category_suggest",
  points: 10,
  duration: 60 * 60,
  key: (req) => String(req.userID),
});

// Admin: creates an approved category. User: suggests one (pending review).
// Body: { name, description? }
router.post(
  "/",
  verifyToken,
  suggestLimiter,
  validate(schemas.createCategory),
  inTransaction,
  categoryController.createCategory,
);

// Public: visitors filter the catalogue by category (approved ones only).
// The admin (signed in) also sees pending/rejected and can filter by ?status.
router.get("/", optionalAuth, categoryController.getCategories);

// The categories I suggested and their status (+ admin's reviewNote).
router.get("/mine", verifyToken, categoryController.getMySuggestions);

router.patch(
  "/:categoryId",
  verifyToken,
  verifyRole("admin"),
  validate(schemas.updateCategory),
  inTransaction,
  categoryController.updateCategory,
);

router.delete(
  "/:categoryId",
  verifyToken,
  verifyRole("admin"),
  inTransaction,
  categoryController.deleteCategory,
);

export default router;
