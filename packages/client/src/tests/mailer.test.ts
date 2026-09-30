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
