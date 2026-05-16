import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { getDb } from "./db";
import { sendMail } from "./mailer";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  (process.env.NODE_ENV === "production"
    ? ""
    : "dev-only-secret-change-me-for-production");

export const auth = betterAuth({
  database: getDb(),
  baseURL,
  secret,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        await sendMail({
          to: email,
          subject: "Your sign-in link for name-check",
          text: `Click to sign in: ${url}\n\nLink expires in 15 minutes.`,
          html: `<p>Click to sign in:</p><p><a href="${url}">${url}</a></p><p>Link expires in 15 minutes.</p>`,
        });
      },
    }),
  ],
});
