import { afterEach, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("rejects missing production SMTP without logging sign-in links", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SMTP_HOST", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { sendMail } = await import("../lib/mailer");
  await expect(sendMail({
    to: "fixture@example.test",
    subject: "Sign in",
    text: "https://example.test/auth?token=fixture-token",
  })).rejects.toThrow("SMTP_HOST must be configured");
  expect(log).not.toHaveBeenCalled();
});


it("sends SMTP replies to the configured single mailbox", async () => {
  vi.stubEnv("EMAIL_TRANSPORT", "smtp");
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("EMAIL_REPLY_TO", "rico@trebeljahr.com");
  const { default: nodemailer } = await import("nodemailer");
  const send = vi.fn().mockResolvedValue({});
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: send } as never);
  const { sendMail } = await import("../lib/mailer");
  await sendMail({ to: "one@example.com", subject: "Fixture", text: "Fixture" });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "one@example.com", replyTo: "rico@trebeljahr.com" }));
  vi.stubEnv("EMAIL_REPLY_TO", "a@example.com\r\nBcc: b@example.com");
  await expect(sendMail({ to: "one@example.com", subject: "Fixture", text: "Fixture" })).rejects.toThrow("Invalid EMAIL_REPLY_TO");
  expect(send).toHaveBeenCalledTimes(1);
});
