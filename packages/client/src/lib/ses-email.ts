/** hatchkit-ses-project-v1: explicit credentials, no default AWS chain and no
 * fallback to shared SMTP/Listmonk credentials. IAM is the sender boundary;
 * these runtime checks additionally prevent configuration mistakes.
 */
import type { SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import { MailDeliveryError, MAIL_DEADLINE_MS } from "./mail-delivery";

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type ProjectSesConfig = Partial<
  Record<
    | "SES_PROJECT_ACCESS_KEY_ID"
    | "SES_PROJECT_SECRET_ACCESS_KEY"
    | "SES_PROJECT_REGION"
    | "SES_PROJECT_IDENTITY_ARN"
    | "SES_PROJECT_TENANT"
    | "SES_PROJECT_CONFIGURATION_SET"
    | "SES_PROJECT_FROM_EMAIL"
    | "SES_PROJECT_REPLY_TO"
    | "EMAIL_TEST_RECIPIENT"
    | "NODE_ENV",
    string
  >
>;

export function projectSesReady(source: ProjectSesConfig): boolean {
  return [
    source.SES_PROJECT_ACCESS_KEY_ID,
    source.SES_PROJECT_SECRET_ACCESS_KEY,
    source.SES_PROJECT_REGION,
    source.SES_PROJECT_IDENTITY_ARN,
    source.SES_PROJECT_TENANT,
    source.SES_PROJECT_CONFIGURATION_SET,
    source.SES_PROJECT_FROM_EMAIL,
  ].every(Boolean);
}

export function projectSesMessage(
  params: EmailParams,
  source: ProjectSesConfig,
): SendEmailCommandInput {
  if (!projectSesReady(source))
    throw new Error(
      "Per-project SES is incomplete. Run the reviewed Hatchkit SES sender migration; shared credentials are never a fallback.",
    );
  const identity = (source.SES_PROJECT_IDENTITY_ARN ?? "").match(
    /^arn:aws:ses:([a-z0-9-]+):\d{12}:identity\/(mail\.[a-z0-9.-]+)$/,
  );
  if (
    !identity ||
    identity[1] !== source.SES_PROJECT_REGION ||
    (source.SES_PROJECT_FROM_EMAIL ?? "").split("@")[1] !== identity[2] ||
    !/^[a-z0-9][a-z0-9._+-]*@[a-z0-9.-]+$/.test(
      source.SES_PROJECT_FROM_EMAIL ?? "",
    )
  )
    throw new Error(
      "SES sender identity, From address and region do not agree.",
    );
  if (
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(params.to) ||
    /[\r\n]/.test(params.subject)
  )
    throw new Error("Invalid email recipient or subject.");
  if (
    source.NODE_ENV !== "production" &&
    (!source.EMAIL_TEST_RECIPIENT ||
      params.to.toLowerCase() !== source.EMAIL_TEST_RECIPIENT.toLowerCase())
  )
    throw new Error(
      "Non-production email may only target EMAIL_TEST_RECIPIENT.",
    );
  const replyTo = source.SES_PROJECT_REPLY_TO;
  if (replyTo && !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(replyTo))
    throw new Error("Invalid SES_PROJECT_REPLY_TO.");
  return {
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
    FromEmailAddress: source.SES_PROJECT_FROM_EMAIL,
    FromEmailAddressIdentityArn: source.SES_PROJECT_IDENTITY_ARN,
    TenantName: source.SES_PROJECT_TENANT,
    ConfigurationSetName: source.SES_PROJECT_CONFIGURATION_SET,
    Destination: { ToAddresses: [params.to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: params.text, Charset: "UTF-8" },
          ...(params.html
            ? { Html: { Data: params.html, Charset: "UTF-8" } }
            : {}),
        },
      },
    },
  };
}

export async function sendProjectSesEmail(
  params: EmailParams,
  source: ProjectSesConfig,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted)
    throw new MailDeliveryError("not_sent", "Email cancelled before delivery");
  let message: SendEmailCommandInput;
  try {
    message = projectSesMessage(params, source);
  } catch (error) {
    throw new MailDeliveryError(
      "not_sent",
      error instanceof Error ? error.message : "Invalid email configuration",
    );
  }
  if (source.NODE_ENV === "test") return; // Tests never open a mail connection.
  const { SESv2Client, SendEmailCommand } =
    await import("@aws-sdk/client-sesv2");
  if (signal?.aborted)
    throw new MailDeliveryError("not_sent", "Email cancelled before delivery");
  const client = new SESv2Client({
    region: source.SES_PROJECT_REGION,
    credentials: {
      accessKeyId: source.SES_PROJECT_ACCESS_KEY_ID!,
      secretAccessKey: source.SES_PROJECT_SECRET_ACCESS_KEY!,
    },
    // SES has no caller idempotency key; never retry an ambiguous send inside the SDK.
    maxAttempts: 1,
  });
  const controller = new AbortController();
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  const stop = (): void => {
    controller.abort();
    client.destroy();
    rejectInterrupted(
      new MailDeliveryError(
        "unknown",
        "Project SES delivery outcome is unknown",
      ),
    );
  };
  const timer = setTimeout(stop, MAIL_DEADLINE_MS);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await Promise.race([
      client.send(new SendEmailCommand(message), {
        abortSignal: controller.signal,
      }),
      interrupted,
    ]);
  } catch {
    throw new MailDeliveryError(
      "unknown",
      "Project SES delivery failed; delivery outcome is unknown and no fallback was attempted.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    client.destroy();
  }
}
