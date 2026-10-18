"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // The API is on the page's own origin. Named explicitly so the static
  // export's prerender never falls back to BETTER_AUTH_URL from the
  // environment, which is the server's setting (and ciphertext in
  // .env.production).
  baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
