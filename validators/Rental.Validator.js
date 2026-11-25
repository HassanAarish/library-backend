import { z } from "zod";
import { int, isoDate, objectId, optionalText } from "./fields.js";

export const createRental = z.object({
  bookId: objectId,
  startDate: isoDate, // omitted → the earliest free slot
  paymentMethod: z
    .enum(["single", "credit"], { message: 'must be "single" or "credit"' })
    .optional(),
  method: optionalText(30), // payment provider, e.g. "easypaisa"
});

export const createReview = z.object({
  rating: int({ min: 1, max: 5 }),
  comment: optionalText(2000),
});
