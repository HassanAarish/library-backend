import nodemailer from "nodemailer";
import { getEnv } from "../config/dotenv.js";

const EMAIL = getEnv("EMAIL");
const PASSWORD = getEnv("PASSWORD");

// SMTP is configurable via env so the app isn't locked to one provider.
// Defaults to iCloud; for Gmail set EMAIL_HOST=smtp.gmail.com (port 465 or 587)
// and use an app-specific password as PASSWORD.
const EMAIL_HOST = getEnv("EMAIL_HOST") || "smtp.mail.me.com";
const EMAIL_PORT = Number(getEnv("EMAIL_PORT")) || 587;

const APP_NAME = "LibraryHub";

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
  auth: { user: EMAIL, pass: PASSWORD },
});

/**
 * Low-level send. Throws if the message can't be delivered so callers can
 * decide how to react (e.g. roll back a registration transaction).
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  const info = await transporter.sendMail({
    from: `"${APP_NAME}" <${EMAIL}>`,
    to,
    subject,
    text,
    html,
  });
  return info;
};

const layout = (title, body) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0b0b14;border-radius:16px;color:#ececf5">
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff">${APP_NAME}</h1>
    <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#c4b5fd">${title}</h2>
    <div style="font-size:14px;line-height:1.6;color:#cfcfe0">${body}</div>
    <p style="margin-top:28px;font-size:12px;color:#6b6b85">If you didn't request this, you can safely ignore this email.</p>
  </div>`;

export const sendOtp = async (email, otp) => {
  return sendEmail({
    to: email,
    subject: `Your ${APP_NAME} verification code`,
    text: `Your verification code is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
    html: layout(
      "Verify your email",
      `<p>Use the code below to verify your email. It expires in <b>5 minutes</b>.</p>
       <p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#fff;margin:20px 0">${otp}</p>
       <p>Never share this code with anyone.</p>`,
    ),
  });
};

export const passwordResetEmail = async (email, link) => {
  return sendEmail({
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    text: `Reset your password using this link (valid for 10 minutes): ${link}`,
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password. This link is valid for <b>10 minutes</b>.</p>
       <p style="margin:24px 0">
         <a href="${link}" style="background:#8b5cf6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">Reset password</a>
       </p>
       <p style="font-size:12px;color:#9c9cb5;word-break:break-all">Or paste this URL into your browser:<br>${link}</p>`,
    ),
  });
};
