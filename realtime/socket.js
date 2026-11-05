import mongoose from "mongoose";
import { Server } from "socket.io";
import redis from "../config/redis.js";
import { authenticateToken } from "../middlewares/verifyToken.js";
import { audit } from "../utils/audit.js";

/**
 * Real-time layer (Socket.IO).
 *
 * Rooms:
 *   user:<id>  every socket of one user (notifications, account events)
 *   admins     every admin socket (new payments to review, new requests, …)
 *   book:<id>  anyone looking at a book (availability changed → refetch)
 *
 * Connecting: io(URL, { auth: { token } }). A token is optional: without one
 * the socket is anonymous and can only watch books (availability is public).
 * A bad, expired or blocked token is refused.
 *
 * Client → server:  "book:watch" (bookId, ack?) · "book:unwatch" (bookId)
 * Server → client:  "notification:new" · "notification:read" ·
 *                   "book:availability" { bookId } · "account:blocked"
 *
 * Events carry ids and short texts only; clients refetch details over HTTP,
 * so every access rule stays in one place.
 */

const MAX_WATCHED_BOOKS = 20;
// Per-socket flood guard: more than this many events in the window disconnects.
const EVENT_LIMIT = 60;
const EVENT_WINDOW_MS = 10 * 1000;

let io = null;

const userRoom = (userId) => `user:${userId}`;
const bookRoom = (bookId) => `book:${bookId}`;
const ADMIN_ROOM = "admins";

const tokenFrom = (socket) => {
  const auth = socket.handshake.auth?.token;
  if (typeof auth === "string" && auth) return auth.replace(/^Bearer\s+/i, "");
  const header = socket.handshake.headers?.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};

const authenticateSocket = async (socket, next) => {
  const token = tokenFrom(socket);
  if (!token) return next(); // anonymous viewer

  try {
    const { user, issuedAt } = await authenticateToken(token, { transport: "socket" });
    socket.data.userId = String(user._id);
    socket.data.role = user.role;
    socket.data.issuedAt = issuedAt;
    next();
  } catch (err) {
    const error = new Error(err.message);
    error.data = { status: err.statusCode || 401 };
    next(error);
  }
};

const floodGuard = (socket) => {
  let windowStart = Date.now();
  let count = 0;

  socket.use((packet, next) => {
    const now = Date.now();
    if (now - windowStart > EVENT_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    if (++count > EVENT_LIMIT) {
      audit("security.socket_flood", {
        outcome: "failure",
        severity: "warning",
        actor: socket.data.userId,
        metadata: { ip: socket.handshake.address, event: packet[0] },
      });
      socket.disconnect(true);
      return;
    }
    next();
  });
};

const onConnection = (socket) => {
  floodGuard(socket);

  if (socket.data.userId) {
    socket.join(userRoom(socket.data.userId));
    if (socket.data.role === "admin") socket.join(ADMIN_ROOM);
  }

  socket.on("book:watch", (bookId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};

    if (!mongoose.isValidObjectId(bookId)) return reply({ ok: false, error: "Invalid book id" });

    const watching = [...socket.rooms].filter((r) => r.startsWith("book:")).length;
    if (watching >= MAX_WATCHED_BOOKS && !socket.rooms.has(bookRoom(bookId))) {
      return reply({ ok: false, error: `You can watch up to ${MAX_WATCHED_BOOKS} books at once.` });
    }

    socket.join(bookRoom(bookId));
    reply({ ok: true });
  });

  socket.on("book:unwatch", (bookId) => {
    if (mongoose.isValidObjectId(bookId)) socket.leave(bookRoom(bookId));
  });
};

/**
 * Attach Socket.IO to the HTTP server. With REDIS_URL set, events reach
 * sockets on every API instance (Redis adapter).
 */
export const initSocket = (httpServer, { origins }) => {
  io = new Server(httpServer, {
    cors: { origin: origins, credentials: true },
    serveClient: false,
  });

  if (redis) {
    import("@socket.io/redis-adapter")
      .then(({ createAdapter }) => {
        // Pub/sub connections need their own clients with queuing enabled.
        const pub = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null });
        const sub = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null });
        io.adapter(createAdapter(pub, sub));
      })
      .catch((err) => console.error("Socket.IO Redis adapter failed:", err.message));
  }

  io.use(authenticateSocket);
  io.on("connection", onConnection);

  return io;
};

export const closeSocket = () => (io ? io.close() : undefined);

// Emitters: safe no-ops when sockets aren't running (scripts, tests, cron-only).

export const emitToUser = (userId, event, payload) => {
  io?.to(userRoom(userId)).emit(event, payload);
};

export const emitToAdmins = (event, payload) => {
  io?.to(ADMIN_ROOM).emit(event, payload);
};

export const emitToBook = (bookId, event, payload) => {
  io?.to(bookRoom(bookId)).emit(event, payload);
};

/** Kick every socket of a user (e.g. just blocked). */
export const disconnectUser = (userId, reason = "account:blocked") => {
  if (!io) return;
  io.to(userRoom(userId)).emit(reason, {});
  io.in(userRoom(userId)).disconnectSockets(true);
};

/** After a password change: drop sockets opened with a token older than `changedAt`. */
export const disconnectStaleSessions = async (userId, changedAt) => {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  const cutoff = new Date(changedAt).getTime();
  for (const s of sockets) {
    if (!s.data.issuedAt || s.data.issuedAt < cutoff) s.disconnect(true);
  }
};
