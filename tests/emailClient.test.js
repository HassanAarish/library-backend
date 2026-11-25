import { afterEach, describe, expect, test, vi } from "vitest";

// What the email client hands to nodemailer: the SMTP login and the From address.
const sent = { transport: null, mail: null };
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (opts) => {
      sent.transport = opts;
      return { sendMail: async (mail) => (sent.mail = mail) };
    },
  },
}));

const load = async (env) => {
  vi.resetModules();
  Object.assign(process.env, env);
  return import("../utils/emailClient.js");
};

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("email sending settings", () => {
  test("a plain mailbox logs in with EMAIL and sends from it", async () => {
    delete process.env.EMAIL_USER;
    const { sendEmail } = await load({ EMAIL: "me@gmail.com", PASSWORD: "app-pass" });
    await sendEmail({ to: "a@t.pk", subject: "Hi", text: "x" });
    expect(sent.transport.auth).toEqual({ user: "me@gmail.com", pass: "app-pass" });
    expect(sent.mail.from).toBe('"LibraryHub" <me@gmail.com>');
  });

  test("a sending service logs in with EMAIL_USER but still sends from EMAIL", async () => {
    const { sendEmail } = await load({
      EMAIL: "no-reply@libraryhub.pk",
      EMAIL_USER: "resend",
      PASSWORD: "re_key",
      EMAIL_HOST: "smtp.resend.com",
      EMAIL_PORT: "465",
    });
    await sendEmail({ to: "a@t.pk", subject: "Hi", text: "x" });
    expect(sent.transport).toMatchObject({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: "re_key" },
    });
    expect(sent.mail.from).toBe('"LibraryHub" <no-reply@libraryhub.pk>');
  });
});
