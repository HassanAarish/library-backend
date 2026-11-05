import asyncHandler from "../middlewares/asyncHandler.js";
import * as notificationService from "../services/Notification.Service.js";

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
