import { createConnection, type Socket } from "node:net";
import nodemailer, { type SendMailOptions } from "nodemailer";

export class MailDeliveryError extends Error {
  constructor(
    public readonly outcome: "not_sent" | "unknown",
    message: string,
  ) {
    super(message);
  }
}
export const MAIL_DEADLINE_MS = 10_000;

/** Own the actual socket: closing a non-pooled Nodemailer transport is insufficient. */
export async function sendSmtpWithDeadline(
  options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  },
  message: SendMailOptions,
  signal?: AbortSignal,
  timeoutMs = MAIL_DEADLINE_MS,
): Promise<void> {
  if (signal?.aborted)
    throw new MailDeliveryError("not_sent", "Email cancelled before delivery");
  let socket: Socket | undefined;
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  let attempted = false;
  let stopped = false;
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  const stop = (): void => {
    stopped = true;
    socket?.destroy(new Error("Email delivery interrupted"));
    rejectInterrupted(
      new MailDeliveryError("unknown", "Email delivery outcome is unknown"),
    );
  };
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    transport = nodemailer.createTransport({
      ...options,
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
      dnsTimeout: timeoutMs,
      getSocket: (_options, callback) => {
        if (stopped) {
          callback(new Error("Email delivery interrupted"));
          return;
        }
        socket = createConnection({ host: options.host, port: options.port });
        let handedOff = false;
        socket.once("error", (error) => {
          if (!handedOff) callback(error);
        });
        socket.once("connect", () => {
          handedOff = true;
          // Nodemailer performs STARTTLS/implicit TLS and certificate validation.
          callback(null, { connection: socket });
        });
      },
    });
    attempted = true;
    await Promise.race([transport.sendMail(message), interrupted]);
  } catch {
    // DATA may have been accepted before any timeout or network failure.
    throw new MailDeliveryError(
      attempted ? "unknown" : "not_sent",
      attempted
        ? "Email delivery outcome is unknown"
        : "Email transport could not start",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    socket?.destroy();
    transport?.close();
  }
}
