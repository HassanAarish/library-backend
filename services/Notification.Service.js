import mongoose from "mongoose";
import Notification from "../models/Notification.Model.js";
import Preferences from "../models/Preferences.Model.js";
import User from "../models/User.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { notifyUsers } from "../utils/emailClient.js";
import { pushNotifications } from "./Push.Service.js";
import { afterCommit } from "../utils/requestContext.js";
import { emitToAdmins, emitToBook, emitToUser } from "../realtime/socket.js";

const toPayload = (n) => ({
  _id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  data: n.data,
  readAt: n.readAt ?? null,
  createdAt: n.createdAt,
});

const optedOutOfEmail = async (userIds) => {
  const rows = await Preferences.find({
    userId: { $in: userIds },
    "notifications.email": false,
  })
    .select("userId")
    .lean();
  return new Set(rows.map((p) => String(p.userId)));
};

/**
 * Save an in-app notification for each recipient, push it to their open
 * sockets and their phones, and (optionally) email it. Blocked users get nothing.
 *
 * email: "always"     transactional (payments, refunds) — sent even if the
 *                     user turned email notifications off
 *        "preference" sent unless notifications.email is false (default)
 *        false        in-app only
 */
const deliver = async (recipients, { type, title, message, data = {}, email = "preference" }) => {
  const ids = [...new Set(recipients.filter(Boolean).map(String))];
  if (!ids.length) return;

  // Nothing reaches blocked accounts or ones closed for deletion.
  const users = await User.find({
    _id: { $in: ids },
    isBlocked: { $ne: true },
    "deletion.scheduledFor": { $exists: false },
    deletedAt: { $exists: false },
  })
    .select("email")
    .lean();
  if (!users.length) return;

  const docs = await Notification.insertMany(
    users.map((u) => ({ recipient: u._id, type, title, message, data })),
  );
  docs.forEach((doc) => emitToUser(doc.recipient, "notification:new", toPayload(doc)));
  pushNotifications(docs); // to their phones (Push.Service); never throws

  if (email) {
    const skip = email === "preference" ? await optedOutOfEmail(ids) : new Set();
    notifyUsers(
      users.filter((u) => !skip.has(String(u._id))).map((u) => u.email),
      title,
      message,
    );
  }
};

/**
 * Notify users once the current transaction commits (right away outside one).
 * Never throws: a notification failure must not undo the action behind it.
 *
 * @param {Array<string|ObjectId>|string|ObjectId} recipients
 * @param {{ type, title, message, data?, email? }} notification
 */
export const notify = (recipients, notification) => {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  afterCommit(() => deliver(list, notification));
};

/** Same, to every admin. In-app only unless `email` is given. */
export const notifyAdmins = (notification) => {
  afterCommit(async () => {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    await deliver(
      admins.map((a) => a._id),
      { email: false, ...notification },
    );
    emitToAdmins("admin:activity", { type: notification.type, data: notification.data ?? {} });
  });
};

/**
 * A book's bookings changed: everyone watching it refetches availability
 * (which is personalised per viewer, so no booking data is broadcast).
 */
export const availabilityChanged = (bookId) => {
  if (!bookId) return;
  afterCommit(() => emitToBook(String(bookId), "book:availability", { bookId: String(bookId) }));
};

// --- Inbox

/** Query: unread=true, type, page, limit. Includes the unread count. */
export const getMyNotifications = async (req) => {
  const filters = { recipient: req.userID };
  if (req.query.unread === "true") filters.readAt = { $exists: false };

  const [data, unreadCount] = await Promise.all([
    helper.paginate(Notification, req, {
      sort: { createdAt: -1 },
      filterFields: ["type"],
      filters,
    }),
    getUnreadCount(req.userID),
  ]);

  return { ...data, unreadCount };
};

export const getUnreadCount = (userId) =>
  Notification.countDocuments({ recipient: userId, readAt: { $exists: false } });

/** Mark some (ids) or all notifications read; other open tabs are told too. */
export const markRead = async (userId, ids) => {
  const filter = { recipient: userId, readAt: { $exists: false } };

  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) {
      throw new ErrorResponse("ids must be a list of 1–100 notification ids.", 400);
    }
    if (!ids.every((id) => mongoose.isValidObjectId(id))) {
      throw new ErrorResponse("Invalid notification id.", 400);
    }
    filter._id = { $in: ids };
  }

  const { modifiedCount } = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  const unreadCount = await getUnreadCount(userId);

  emitToUser(userId, "notification:read", { ids: ids ?? "all", unreadCount });

  return { updated: modifiedCount, unreadCount };
};

export const deleteNotification = async (userId, notificationId) => {
  const { deletedCount } = await Notification.deleteOne({
    _id: notificationId,
    recipient: userId,
  });
  if (!deletedCount) throw new ErrorResponse("Notification not found", 404);
  return { unreadCount: await getUnreadCount(userId) };
};
