import { z } from "zod";
import { anyPassword, assetRef, isoDate, newPassword, optionalText, text } from "./fields.js";

const address = z.object({
  street: text(200),
  city: text(80),
  state: optionalText(80),
  zip: optionalText(20),
  country: text(80),
  isDefault: z.boolean().optional(),
  label: optionalText(40),
});

const preferences = z.object({
  alternativeEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.email({ message: "must be a valid email address" }).optional(),
  ),
  phoneNumber: optionalText(20),
  bio: optionalText(500),
  dob: isoDate,
  gender: z.enum(["male", "female", "other", "prefer not to say"]).optional(),
  notifications: z
    .object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional(),
    })
    .optional(),
  addresses: z.array(address).max(10, { message: "at most 10 addresses" }).optional(),
});

export const updateProfile = z.object({
  name: optionalText(60),
  prefData: preferences.optional(),
});

export const updatePassword = z
  .object({ currentPassword: anyPassword, newPassword })
  .refine((b) => b.currentPassword !== b.newPassword, {
    message: "must be different from the current password",
    path: ["newPassword"],
  });

export const profilePicture = z.object({ profilePicture: assetRef });
