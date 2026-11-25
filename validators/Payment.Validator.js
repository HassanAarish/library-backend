import { z } from "zod";
import {
  assetRef,
  atLeastOneField,
  int,
  objectId,
  optionalInt,
  optionalText,
  pakistaniMobile,
  text,
} from "./fields.js";

export const submitProof = z.object({
  transactionId: text(40),
  senderNumber: pakistaniMobile,
  senderName: optionalText(80),
  screenshot: assetRef,
});

export const rejectPayment = z.object({ reason: text(500) });

export const resolveRefund = z.object({
  status: z.enum(["refunded", "declined"], { message: "must be refunded or declined" }),
  note: optionalText(500),
});

// --- Packages

const plan = {
  name: text(60),
  description: optionalText(500),
  credits: int({ min: 1, max: 100 }),
  price: int({ min: 0, max: 1000000 }),
  validityDays: optionalInt({ min: 1, max: 3650 }),
  isActive: z.boolean({ message: "must be true or false" }).optional(),
  sortOrder: optionalInt({ min: 0, max: 1000 }),
};

export const createPlan = z.object(plan);

export const updatePlan = z
  .object(plan)
  .partial()
  .refine(...atLeastOneField);

export const purchase = z.object({
  planId: objectId,
  method: optionalText(30),
});
