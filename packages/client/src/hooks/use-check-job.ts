"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import {
  dismissPendingCheck,
  prepareCheck,
  readPendingCheck,
  streamCheckJob,
  type CheckKind,
  type CheckMessage,
  type PendingCheck,
} from "@/lib/check-job-client";

export function useCheckJob(kind: CheckKind): {
  owner: string | null;
  pending: PendingCheck | null;
  storageError: string | null;
  run: (
    input: unknown,
    onMessage: (message: CheckMessage) => void,
  ) => Promise<void>;
  dismiss: () => void;
} {
  const { data: session, isPending } = useSession();
  const owner = isPending
    ? null
    : session?.user.id
      ? `user:${session.user.id}`
      : "anonymous";
  const [pending, setPending] = useState<PendingCheck | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  function refresh(identity: string): void {
    try {
      setPending(readPendingCheck(sessionStorage, kind, identity));
      setStorageError(null);
    } catch {
      setStorageError(
        "Browser storage is unavailable or the saved check is damaged. A check cannot start until it can be saved.",
      );
    }
  }
  useEffect(() => {
    active.current?.abort(new Error("Sign-in changed"));
    active.current = null;
    setPending(null);
    if (owner) refresh(owner);
    return () => {
      active.current?.abort(new Error("Check view closed"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, kind]);
  async function run(
    input: unknown,
    onMessage: (message: CheckMessage) => void,
  ): Promise<void> {
    if (!owner || owner !== currentOwner.current)
      throw new Error("Wait for sign-in to finish.");
    if (active.current) throw new Error("A check is already running.");
    const controller = new AbortController();
    active.current = controller;
    try {
      const job = prepareCheck(sessionStorage, kind, owner, input);
      setPending(job);
      await streamCheckJob(
        job,
        sessionStorage,
        (message) => {
          if (currentOwner.current !== owner || controller.signal.aborted)
            throw new Error("Sign-in changed");
          onMessage(message);
        },
        controller.signal,
      );
    } finally {
      if (active.current === controller) active.current = null;
      if (currentOwner.current === owner) refresh(owner);
    }
  }
  function dismiss(): void {
    if (!owner || active.current) return;
    try {
      dismissPendingCheck(sessionStorage, kind, owner);
      refresh(owner);
    } catch {
      setStorageError("Browser storage could not be updated.");
    }
  }
  return {
    owner,
    pending: pending?.owner === owner ? pending : null,
    storageError,
    run,
    dismiss,
  };
}
