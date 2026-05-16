import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host) return null;
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cached;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const t = getTransporter();
  const from = process.env.MAIL_FROM ?? "name-check <noreply@example.com>";
  if (!t) {
    console.log(
      `[mailer] SMTP not configured. Would send to ${opts.to}:\n${opts.subject}\n${opts.text}`,
    );
    return;
  }
  await t.sendMail({ from, ...opts });
}
