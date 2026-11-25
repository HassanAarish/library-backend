import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import validate from "../middlewares/validate.js";
import { createLimiter } from "../middlewares/rateLimiter.js";
import { markRead, registerDevice, unregisterDevice } from "../validators/Community.Validator.js";
import * as notificationController from "../controller/Notification.Controller.js";

const router = express.Router();

router.use(verifyToken);

// The app registers on every sign-in and app start; this only stops floods.
const deviceLimiter = createLimiter({
  keyPrefix: "rl_push_device",
  points: 30,
  duration: 60 * 60,
  key: (req) => String(req.userID),
});

// --- Phones for push notifications (mobile app)

// Body: { token: "ExponentPushToken[…]", platform: "android" | "ios" }
router.post(
  "/devices",
  deviceLimiter,
  validate(registerDevice),
  notificationController.registerDevice,
);

// Body: { token } (sign-out)
router.delete(
  "/devices",
  deviceLimiter,
  validate(unregisterDevice),
  notificationController.unregisterDevice,
);

// --- Inbox

// ?unread=true&type=…&page&limit
router.get("/", notificationController.getMyNotifications);

router.get("/unread-count", notificationController.getUnreadCount);

// Body: { ids: [...] }
router.patch("/read", validate(markRead), notificationController.markRead);

router.patch("/read-all", notificationController.markAllRead);

router.delete("/:notificationId", notificationController.deleteNotification);

export default router;
