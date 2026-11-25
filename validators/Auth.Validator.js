import { z } from "zod";
import { anyPassword, email, newPassword, optionalText, text } from "./fields.js";

// 6-digit codes may arrive as a number or a string.
const sixDigits = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z
    .string({ message: "is required" })
    .trim()
    .regex(/^\d{6}$/, { message: "must be the 6-digit code" }),
);

export const register = z.object({
  name: text(60, { min: 2 }),
  email,
  password: newPassword,
  authType: z.enum(["email", "google", "facebook"], {
    message: "must be email, google or facebook",
  }),
});

export const verifyOtp = z.object({ email, otp: sixDigits });

export const emailOnly = z.object({ email });

export const login = z.object({
  email,
  password: anyPassword,
  authType: z.enum(["email", "google", "facebook"], {
    message: "must be email, google or facebook",
  }),
});

// The token may also come in the query string (?token=… from the email link).
export const resetPassword = z.object({
  token: optionalText(200),
  password: newPassword,
});

export const social = z.object({
  provider: z.enum(["google", "facebook"], { message: "must be google or facebook" }),
  token: text(4096),
  name: optionalText(60),
  link: z.boolean({ message: "must be true or false" }).optional(),
});

export const twoFactorCode = z.object({ code: sixDigits });

export const twoFactorLogin = z.object({
  pendingToken: text(2048),
  code: sixDigits,
});
