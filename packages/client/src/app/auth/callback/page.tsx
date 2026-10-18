"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// `public/_redirects` sends /auth/callback to /account before this page
// loads; this covers `next dev` and anything that reaches the shell.
export default function AuthCallbackPage(): null {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account");
  }, [router]);
  return null;
}
