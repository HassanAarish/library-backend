import PushDevice from "../models/PushDevice.Model.js";
import Preferences from "../models/Preferences.Model.js";
import { getEnv } from "../config/dotenv.js";

/**
 * Push notifications to the mobile app, sent through Expo's push service
 * (which hands them to Google's FCM for Android). Every in-app notification
 * for a reader is also pushed to their registered phones, unless they turned
 * push off in their preferences (notifications.push).
 *
 * Pushes are shown by the phone outside the app, so their text must follow
 * the app's rules: no prices, payments, refunds or "rent/buy" wording (Google
 * Play's payments policy). `pushContent` rewrites those notification types
 * and drops anything else that slips through. Keep it in step with the app's
 * lib/notificationText.js.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100; // Expo accepts up to 100 messages per request
const MAX_DEVICES_PER_USER = 10;

// Admin work happens on the website; the app is for readers.
const ADMIN_TYPES = new Set([
  "payment.submitted",
  "refund.requested",
  "book_request.created",
  "category.proposed",
]);

const PAYMENT_WORDS =
  /\bpay|paid\b|payment|price|\bRs\.?\s?\d|easypaisa|refund|\bbuy|purchase|rent it|to rent\b|rent now|\brent\b/i;

const GENERIC = {
  title: "LibraryHub",
  body: "You have a new update. Open the app to see it.",
};

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The title and body a push shows on the phone, or null for types that are
 * never pushed. Pure, so it's easy to test.
 */
export const pushContent = ({ type, title = "", message = "", data = {} }) => {
  if (ADMIN_TYPES.has(type)) return null;

  let content;
  switch (type) {
    case "payment.approved":
      content = data.userPackageId
        ? { title: "Reading plan active", body: "Your reading plan is now active." }
        : {
            title: "Booking confirmed",
            body: "Your booking is confirmed. Your library shows when you can start reading.",
          };
      break;
    case "payment.rejected":
      content = {
        title: "Booking not confirmed",
        body: "We couldn't confirm this booking. Contact us if you have questions.",
      };
      break;
    case "refund.resolved":
      content = { title: "Update on a cancelled booking", body: "We've emailed you the details." };
      break;
    case "rental.hold_expired":
      content = {
        title: "Booking released",
        body: "This booking wasn't confirmed in time, so its dates were released.",
      };
      break;
    case "book_request.fulfilled":
      content = {
        title,
        body: "The book you asked for has been added. Find it in the catalogue.",
      };
      break;
    default:
      content = { title, body: message };
  }

  // Safety net for wording added later that the app mustn't show.
  if (PAYMENT_WORDS.test(content.title) || PAYMENT_WORDS.test(content.body)) content = GENERIC;

  return { title: clip(content.title, 100), body: clip(content.body, 240) };
};

// --- Devices

/** Save (or move to this user) the phone's push token. */
export const registerDevice = async (userId, { token, platform }) => {
  await PushDevice.findOneAndUpdate(
    { token },
    { $set: { user: userId, platform, lastSeenAt: new Date() } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  // Keep the newest few: old phones that never signed out drop off.
  const stale = await PushDevice.find({ user: userId })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_DEVICES_PER_USER)
    .select("_id")
    .lean();
  if (stale.length) await PushDevice.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
};

/** Stop pushing to this phone for this user (sign-out). */
export const unregisterDevice = async (userId, token) => {
  await PushDevice.deleteOne({ user: userId, token });
};

// --- Sending

/** Sends one batch to Expo and returns its tickets, in the same order. */
const expoTransport = async (messages) => {
  const accessToken = getEnv("EXPO_ACCESS_TOKEN");
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
};

// Tests never reach Expo: they install their own transport.
let transport =
  getEnv("NODE_ENV") === "test" ? async (messages) => messages.map(() => ({})) : expoTransport;

/** For tests: replace how messages are sent. Returns the previous transport. */
export const setPushTransport = (fn) => {
  const previous = transport;
  transport = fn;
  return previous;
};

const pushOff = async (userIds) => {
  const rows = await Preferences.find({
    userId: { $in: userIds },
    "notifications.push": false,
  })
    .select("userId")
    .lean();
  return new Set(rows.map((p) => String(p.userId)));
};

/**
 * Push saved notifications (one per recipient) to their phones. Never throws:
 * a push failure must not affect the in-app notification or the action
 * behind it.
 *
 * @param {Array<{ _id, recipient, type, title, message, data }>} notifications
 */
export const pushNotifications = async (notifications) => {
  try {
    const recipients = [...new Set(notifications.map((n) => String(n.recipient)))];
    if (!recipients.length) return;

    const off = await pushOff(recipients);
    const wanted = notifications.filter((n) => !off.has(String(n.recipient)));
    if (!wanted.length) return;

    const devices = await PushDevice.find({ user: { $in: wanted.map((n) => n.recipient) } })
      .select("user token")
      .lean();
    if (!devices.length) return;

    const messages = [];
    for (const n of wanted) {
      const content = pushContent(n);
      if (!content) continue;
      for (const d of devices) {
        if (String(d.user) !== String(n.recipient)) continue;
        messages.push({
          to: d.token,
          title: content.title,
          body: content.body,
          // The app opens the matching screen from these (lib/notificationLink.js).
          data: { notificationId: String(n._id), type: n.type, data: n.data ?? {} },
          sound: "default",
          channelId: "default",
          priority: "high",
        });
      }
    }

    const gone = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      try {
        const tickets = await transport(batch);
        tickets.forEach((ticket, j) => {
          if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            gone.push(batch[j].to);
          }
        });
      } catch (err) {
        console.error(`Push send failed: ${err.message}`);
      }
    }
    if (gone.length) await PushDevice.deleteMany({ token: { $in: gone } });
  } catch (err) {
    console.error(`Push notifications failed: ${err.message}`);
  }
};
