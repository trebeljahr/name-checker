import { MailDeliveryError, sendSmtpWithDeadline } from "./mail-delivery";
import { sendProjectSesEmail } from "./ses-email";

export async function sendMail(
  opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  },
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (options.signal?.aborted)
    throw new MailDeliveryError("not_sent", "Email cancelled before delivery");
  // Explicit opt-in; no SMTP fallback after any SES failure.
  const transport = process.env.EMAIL_TRANSPORT;
  if (transport === "ses") {
    await sendProjectSesEmail(opts, process.env, options.signal);
    return;
  }
  if (transport && transport !== "smtp")
    throw new MailDeliveryError("not_sent", "Unknown EMAIL_TRANSPORT");
  const host = process.env.SMTP_HOST;
  if (!host)
    throw new MailDeliveryError(
      "not_sent",
      "SMTP_HOST must be configured for email delivery",
    );
  const replyTo = process.env.EMAIL_REPLY_TO;
  if (replyTo && !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(replyTo))
    throw new MailDeliveryError("not_sent", "Invalid EMAIL_REPLY_TO");
  if (
    !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(opts.to) ||
    /[\r\n]/.test(opts.subject)
  )
    throw new MailDeliveryError(
      "not_sent",
      "Invalid email recipient or subject",
    );
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER,
    pass = process.env.SMTP_PASS;
  await sendSmtpWithDeadline(
    {
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    },
    {
      from: process.env.MAIL_FROM ?? "name-check <noreply@example.com>",
      ...opts,
      ...(replyTo ? { replyTo } : {}),
    },
    options.signal,
  );
}
