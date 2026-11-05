import { z } from "zod";
import {
  assetRef,
  atLeastOneField,
  int,
  objectId,
  optionalInt,
  optionalText,
  text,
} from "./fields.js";

const nextYear = new Date().getFullYear() + 1;

const metadata = {
  title: text(200),
  author: text(120),
  description: text(5000),
  language: optionalText(40),
  isbn: optionalText(20),
  publishedYear: optionalInt({ min: 0, max: nextYear }),
  price: int({ min: 0, max: 100000 }), // whole rupees per rental
  rentalDays: optionalInt({ min: 1, max: 90 }),
  categoryId: objectId,
  file: assetRef,
  coverImage: assetRef,
};

export const createBook = z.object({
  ...metadata,
  status: z.enum(["draft", "published"], { message: "must be draft or published" }).optional(),
});

export const updateBook = z
  .object(metadata)
  .partial()
  .refine(...atLeastOneField);

export const setStatus = z.object({
  status: z.enum(["draft", "published", "archived"], {
    message: "must be draft, published or archived",
  }),
});
