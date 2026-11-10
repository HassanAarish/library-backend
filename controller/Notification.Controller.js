import asyncHandler from "../middlewares/asyncHandler.js";
import * as notificationService from "../services/Notification.Service.js";
import * as pushService from "../services/Push.Service.js";

export const registerDevice = asyncHandler(async (req, res) => {
  await pushService.registerDevice(req.userID, req.body);

  return res.status(200).json({ success: true, message: "Push notifications on for this device." });
});

export const unregisterDevice = asyncHandler(async (req, res) => {
  await pushService.unregisterDevice(req.userID, req.body.token);

  return res
    .status(200)
    .json({ success: true, message: "Push notifications off for this device." });
});

export const getMyNotifications = asyncHandler(async (req, res) => {
  const data = await notificationService.getMyNotifications(req);

  return res.status(200).json({
    success: true,
    data, // paginated + unreadCount
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await notificationService.getUnreadCount(req.userID);

  return res.status(200).json({
    success: true,
    data: { unreadCount },
  });
});

export const markRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markRead(req.userID, req.body?.ids);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markRead(req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const data = await notificationService.deleteNotification(req.userID, req.params.notificationId);

  return res.status(200).json({
    success: true,
    message: "Notification deleted.",
    data,
  });
});
