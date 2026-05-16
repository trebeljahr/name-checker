"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu(): React.ReactElement {
  const { data, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (isPending) {
    return <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />;
  }

  if (!data?.user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        Sign in
      </Link>
    );
  }

  const email = data.user.email;
  const initial = email?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 dark:text-emerald-300"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {email}
          </div>
          <Link
            href="/account"
            className="block px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          <Link
            href="/pricing"
            className="block px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Pricing
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={async () => {
              setOpen(false);
              await signOut();
              window.location.href = "/";
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
