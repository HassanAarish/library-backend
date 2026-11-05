import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import verifyRole from "../middlewares/verifyRole.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import { inTransaction } from "../middlewares/transaction.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import validate from "../middlewares/validate.js";
import * as schemas from "../validators/Community.Validator.js";
import policy from "../config/bookRequestPolicy.js";
import * as bookRequestController from "../controller/BookRequest.Controller.js";

const router = express.Router();

const admin = [verifyToken, verifyRole("admin")];

// Creating/joining requests is cheap for a user but each one may become an
// admin task and follower emails, so it's capped per user.
const requestLimiter = createLimiter({
  keyPrefix: "rl_book_request",
  points: policy.actionsPerHour,
  duration: 60 * 60,
  key: (req) => String(req.userID),
});

// Public: most-wanted books. Logged-in users also see what they follow.
router.get("/", optionalAuth, bookRequestController.getCommunityRequests);

// --- Admin (before /:requestId)

router.get("/admin", ...admin, bookRequestController.getAdminRequests);

router.get("/admin/:requestId", ...admin, bookRequestController.getAdminRequest);

// Body: { status: "open" | "reviewing" | "planned" | "rejected", note? }
router.patch(
  "/admin/:requestId/status",
  ...admin,
  validate(schemas.bookRequestStatus),
  inTransaction,
  bookRequestController.updateStatus,
);

// Body: { bookId, note? }  (the book must be published)
router.post(
  "/admin/:requestId/fulfill",
  ...admin,
  validate(schemas.fulfillBookRequest),
  inTransaction,
  bookRequestController.fulfillRequest,
);

// Body: { intoId }
router.post(
  "/admin/:requestId/merge",
  ...admin,
  validate(schemas.mergeBookRequest),
  inTransaction,
  bookRequestController.mergeRequest,
);

// --- User

// Body: { title, author?, isbn?, language?, note? }
router.post(
  "/",
  verifyToken,
  requestLimiter,
  validate(schemas.createBookRequest),
  inTransaction,
  bookRequestController.createRequest,
);

router.get("/mine", verifyToken, bookRequestController.getMyRequests);

router.get("/:requestId", optionalAuth, bookRequestController.getRequest);

// Body: { note? }
router.post(
  "/:requestId/follow",
  verifyToken,
  requestLimiter,
  validate(schemas.followBookRequest),
  inTransaction,
  bookRequestController.followRequest,
);

router.delete(
  "/:requestId/follow",
  verifyToken,
  inTransaction,
  bookRequestController.unfollowRequest,
);

export default router;
