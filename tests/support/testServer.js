import http from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { io as ioClient } from "socket.io-client";
import { inject, vi } from "vitest";

/**
 * Boots the real app (Express + Socket.IO) in-process on a random port,
 * against a fresh database on the in-memory replica set.
 *
 *   const t = await startTestServer("rentals");
 *   const r = await t.api("POST", "/rental", { token: user.token, body: {...} });
 *   await t.close();
 *
 * Console output is captured in `t.logs` (keeps the run quiet and lets tests
 * count failed notification emails with `t.mailFailures(title)`).
 */
export const startTestServer = async (dbName) => {
  const logs = [];
  for (const level of ["log", "info", "warn", "error"]) {
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    });
  }

  await mongoose.connect(inject("mongoUri"), { dbName });
  await mongoose.connection.dropDatabase();

  const { default: app } = await import("../../app.js");
  const { initSocket, closeSocket } = await import("../../realtime/socket.js");
  const { flushRequestLogs } = await import("../../middlewares/requestLogger.js");

  // Wait for every index (unique/partial ones matter for race tests).
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));

  const server = http.createServer(app);
  initSocket(server, { origins: ["http://localhost:5173"] });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const db = mongoose.connection.db;
  const now = new Date();
  const sockets = [];

  const api = async (method, path, { token, body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      // not JSON
    }
    return { status: res.status, json, headers: res.headers };
  };

  const tokenFor = (userId, role = "user", options = { expiresIn: "1h" }) =>
    jwt.sign({ user: { userID: userId, role } }, process.env.SECRET_KEY, options);

  /** Insert a verified user directly and mint a token for them. */
  const mkUser = async (name, { role = "user", password, ...extra } = {}) => {
    const email = `${name.toLowerCase()}@t.pk`;
    const { insertedId } = await db.collection("users").insertOne({
      name,
      email,
      role,
      isVerified: true,
      authType: "email",
      ...(password && { password: await bcrypt.hash(password, 10) }),
      createdAt: now,
      ...extra,
    });
    return { id: insertedId, email, token: tokenFor(insertedId, role) };
  };

  const mkCategory = async (name = "Fiction") => {
    const { insertedId } = await db.collection("categories").insertOne({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      status: "approved",
      bookCount: 0,
    });
    return insertedId;
  };

  /** Insert a book directly (no Cloudinary). */
  const mkBook = async (
    title,
    { price = 300, rentalDays = 14, status = "published", ...extra } = {},
  ) => {
    const category = extra.category ?? (await mkCategory(`Cat ${title}`));
    const { insertedId } = await db.collection("books").insertOne({
      title,
      author: "Writer",
      description: "d",
      price,
      currency: "PKR",
      rentalDays,
      pageCount: 10,
      category,
      file: { public_id: `library/books/${title}`, name: `${title}.pdf`, pages: 10 },
      status,
      createdBy: extra.createdBy ?? new mongoose.Types.ObjectId(),
      createdAt: now,
      ...extra,
    });
    return insertedId;
  };

  /** A private image asset owned by `user` (e.g. a payment screenshot). */
  const mkPrivateImage = async (user, publicId = `library/payment-proofs/${user.id}`) => {
    await db.collection("assets").insertOne({
      public_id: publicId,
      owner: user.id,
      resourceType: "image",
      deliveryType: "authenticated",
      url: "https://example.test/s.png",
      mimetype: "image/png",
      name: "s.png",
    });
    return { public_id: publicId };
  };

  /** Socket.IO client; resolves once connected, rejects with the connect error. */
  const connect = (token) =>
    new Promise((resolve, reject) => {
      const socket = ioClient(base, {
        auth: token ? { token } : {},
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const events = [];
      socket.onAny((event, payload) => events.push({ event, payload }));
      socket.on("connect", () => resolve({ socket, events }));
      socket.on("connect_error", reject);
    });

  const mailFailures = (title) =>
    logs.filter((line) => line.includes(`Failed to send "${title}" email`)).length;

  const close = async () => {
    sockets.forEach((s) => s.close());
    closeSocket();
    await new Promise((resolve) => server.close(resolve));
    await flushRequestLogs();
    await mongoose.disconnect();
    vi.restoreAllMocks();
  };

  return {
    base,
    db,
    api,
    tokenFor,
    mkUser,
    mkCategory,
    mkBook,
    mkPrivateImage,
    connect,
    logs,
    mailFailures,
    close,
  };
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `predicate()` returns something truthy (or time out → null). */
export const waitFor = async (predicate, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = await predicate();
    if (hit) return hit;
    await sleep(50);
  }
  return null;
};

export const oid = (id) => new mongoose.Types.ObjectId(String(id));
