import { z } from "zod";

/**
 * Field rules shared by every request schema (validators/*.Validator.js).
 * Limits mirror the Mongoose models so a request fails early with a clear
 * message instead of deep inside a transaction.
 */

// Blank strings count as "not sent", so optional fields may be left empty in forms.
const blankToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** For update schemas: at least one field must actually be sent. */
export const atLeastOneField = [
  (body) => Object.values(body).some((v) => v !== undefined),
  { message: "Send at least one field to update." },
];

// Type errors: "is required" when the field is missing, "must be text" otherwise.
const requiredString = (expected = "text") =>
  z.string({
    error: (issue) => (issue.input === undefined ? "is required" : `must be ${expected}`),
  });

export const text = (max, { min = 1 } = {}) =>
  requiredString()
    .trim()
    .min(min, { message: min === 1 ? "is required" : `must be at least ${min} characters` })
    .max(max, { message: `must be at most ${max} characters` });

export const optionalText = (max) => z.preprocess(blankToUndefined, text(max).optional());

export const objectId = requiredString("a valid id").regex(/^[a-f\d]{24}$/i, {
  message: "must be a valid id",
});

export const email = requiredString("an email address")
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "must be a valid email address" }));

// New passwords only. Login accepts any non-empty password so older
// accounts created before this rule still work.
export const newPassword = requiredString()
  .min(8, { message: "must be at least 8 characters" })
  .max(128, { message: "must be at most 128 characters" })
  .regex(/[A-Za-z]/, { message: "must contain a letter" })
  .regex(/\d/, { message: "must contain a number" });

export const anyPassword = requiredString().min(1, { message: "is required" }).max(128);

// Whole numbers; numeric strings from form posts are accepted ("300").
const toNumber = (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);

export const int = ({ min, max } = {}) => {
  let schema = z
    .number({ error: (issue) => (issue.input === undefined ? "is required" : "must be a number") })
    .int({ message: "must be a whole number" });
  if (min !== undefined) schema = schema.min(min, { message: `must be at least ${min}` });
  if (max !== undefined) schema = schema.max(max, { message: `must be at most ${max}` });
  return z.preprocess(toNumber, schema);
};

export const optionalInt = (limits) => z.preprocess(blankToUndefined, int(limits).optional());

export const isoDate = z.preprocess(
  blankToUndefined,
  z.coerce
    .date({ message: "must be a valid date" })
    .refine((d) => !Number.isNaN(d.getTime()), { message: "must be a valid date" })
    .optional(),
);

/** An uploaded file reference: only its public_id is trusted (URLs come from the Asset record). */
export const assetRef = z.object(
  { public_id: text(300) },
  {
    error: (issue) =>
      issue.input === undefined ? "is required" : "must be an uploaded file ({ public_id })",
  },
);

export const pakistaniMobile = requiredString("a mobile number")
  .trim()
  .transform((v) =>
    v
      .replace(/[\s-]/g, "")
      .replace(/^\+92/, "0")
      .replace(/^92(?=3)/, "0"),
  )
  .pipe(z.string().regex(/^03\d{9}$/, { message: "must be a mobile number like 03001234567" }));
