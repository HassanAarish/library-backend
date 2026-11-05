import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import validate from "../middlewares/validate.js";
import { markRead } from "../validators/Community.Validator.js";
import * as notificationController from "../controller/Notification.Controller.js";

const router = express.Router();

router.use(verifyToken);

// ?unread=true&type=…&page&limit
router.get("/", notificationController.getMyNotifications);

router.get("/unread-count", notificationController.getUnreadCount);

// Body: { ids: [...] }
router.patch("/read", validate(markRead), notificationController.markRead);

router.patch("/read-all", notificationController.markAllRead);

router.delete("/:notificationId", notificationController.deleteNotification);

export default router;
