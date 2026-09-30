import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectSesMessage, sendProjectSesEmail, type ProjectSesConfig } from "../lib/ses-email";

const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), config: vi.fn() }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    constructor(config: unknown) { sdk.config(config); }
    send = sdk.send;
    destroy = sdk.destroy;
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));
const config: ProjectSesConfig = {
  NODE_ENV: "production",
  SES_PROJECT_ACCESS_KEY_ID: "fixture-key",
  SES_PROJECT_SECRET_ACCESS_KEY: "fixture-secret",
  SES_PROJECT_REGION: "eu-west-1",
  SES_PROJECT_IDENTITY_ARN: "arn:aws:ses:eu-west-1:123456789012:identity/mail.names.example.test",
  SES_PROJECT_TENANT: "fixture-tenant",
  SES_PROJECT_CONFIGURATION_SET: "fixture-config",
  SES_PROJECT_FROM_EMAIL: "noreply@mail.names.example.test",
};
const mail = { to: "user@example.test", subject: "Sign in", text: "Private magic link", html: "<p>Private magic link</p>" };
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("project SES email", () => {
  it("sends with explicit project credentials, tenant, identity and configuration set", async () => {
    sdk.send.mockResolvedValue({ MessageId: "fixture" });
    await sendProjectSesEmail(mail, config);
    expect(sdk.config).toHaveBeenCalledWith({ region: "eu-west-1", credentials: { accessKeyId: "fixture-key", secretAccessKey: "fixture-secret" } });
    expect(sdk.send.mock.calls[0][0].input).toMatchObject({
      FromEmailAddress: config.SES_PROJECT_FROM_EMAIL,
      FromEmailAddressIdentityArn: config.SES_PROJECT_IDENTITY_ARN,
      TenantName: config.SES_PROJECT_TENANT,
      ConfigurationSetName: config.SES_PROJECT_CONFIGURATION_SET,
      Destination: { ToAddresses: [mail.to] },
      Content: { Simple: { Body: { Text: { Data: mail.text }, Html: { Data: mail.html } } } },
    });
    expect(sdk.destroy).toHaveBeenCalledOnce();
  });
  it.each(Object.keys(config).filter(key => key.startsWith("SES_PROJECT_")))("rejects missing %s before connecting", async key => {
    await expect(sendProjectSesEmail(mail, { ...config, [key]: "" })).rejects.toThrow("incomplete");
    expect(sdk.config).not.toHaveBeenCalled();
  });
  it.each([
    { SES_PROJECT_REGION: "us-east-1" },
    { SES_PROJECT_FROM_EMAIL: "noreply@mail.other.example.test" },
    { SES_PROJECT_FROM_EMAIL: "Name <noreply@mail.names.example.test>" },
  ])("rejects mismatched sender metadata %j", patch => {
    expect(() => projectSesMessage(mail, { ...config, ...patch })).toThrow("do not agree");
  });
  it("rejects recipient lists and subject injection", () => {
    expect(() => projectSesMessage({ ...mail, to: "a@example.test,b@example.test" }, config)).toThrow("Invalid email");
    expect(() => projectSesMessage({ ...mail, subject: "Sign in\r\nBcc: victim@example.test" }, config)).toThrow("Invalid email");
  });
  it("requires the allowed recipient outside production and never connects in tests", async () => {
    expect(() => projectSesMessage(mail, { ...config, NODE_ENV: "development" })).toThrow("EMAIL_TEST_RECIPIENT");
    await sendProjectSesEmail(mail, { ...config, NODE_ENV: "test", EMAIL_TEST_RECIPIENT: mail.to });
    expect(sdk.config).not.toHaveBeenCalled();
  });
  it("redacts provider failures and closes the client", async () => {
    sdk.send.mockRejectedValue(new Error("Private magic link and fixture-secret"));
    const log = vi.spyOn(console, "log");
    await expect(sendProjectSesEmail(mail, config)).rejects.toThrow("Project SES delivery failed");
    expect(log).not.toHaveBeenCalled();
    expect(sdk.destroy).toHaveBeenCalledOnce();
  });
  it("does not fall back to SMTP when SES configuration is incomplete", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "ses");
    vi.stubEnv("SES_PROJECT_ACCESS_KEY_ID", "");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    const { sendMail } = await import("../lib/mailer");
    await expect(sendMail(mail)).rejects.toThrow("incomplete");
    expect(sdk.config).not.toHaveBeenCalled();
  });
});
