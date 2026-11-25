import { z } from "zod";
import { atLeastOneField, objectId, optionalText, text } from "./fields.js";

// --- Book requests

export const createBookRequest = z.object({
  title: text(200),
  author: optionalText(120),
  isbn: optionalText(20),
  language: optionalText(40),
  note: optionalText(500),
});

export const followBookRequest = z.object({ note: optionalText(500) });

export const bookRequestStatus = z.object({
  status: z.enum(["open", "reviewing", "planned", "rejected"], {
    message: "must be open, reviewing, planned or rejected",
  }),
  note: optionalText(1000),
});

export const fulfillBookRequest = z.object({ bookId: objectId, note: optionalText(1000) });

export const mergeBookRequest = z.object({ intoId: objectId });

// --- Categories

export const createCategory = z.object({
  name: text(60, { min: 2 }),
  description: optionalText(500),
});

export const updateCategory = z
  .object({
    name: text(60, { min: 2 }).optional(),
    description: optionalText(500),
    status: z
      .enum(["approved", "pending", "rejected"], {
        message: "must be approved, pending or rejected",
      })
      .optional(),
    note: optionalText(500), // shown to the reader who suggested it
  })
  .refine(...atLeastOneField);

// --- Notifications

export const markRead = z.object({
  ids: z
    .array(objectId, { message: "must be a list of notification ids" })
    .min(1, { message: "must contain at least one id" })
    .max(100, { message: "at most 100 ids at once" }),
});

// Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
const pushToken = z
  .string({ message: "is required" })
  .trim()
  .regex(/^Expo(nent)?PushToken\[[^\]\s]{10,200}\]$/, { message: "must be an Expo push token" });

export const registerDevice = z.object({
  token: pushToken,
  platform: z.enum(["android", "ios"], { message: "must be android or ios" }),
});

export const unregisterDevice = z.object({ token: pushToken });

// --- Uploads

export const removeFiles = z
  .object({
    public_id: optionalText(300),
    publicIds: z.array(z.string().trim().min(1).max(300)).min(1).max(50).optional(),
  })
  .refine((b) => b.public_id || b.publicIds, { message: "Send public_id or publicIds." });
