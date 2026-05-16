"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const TM_KEY = "name-check:hide-tm-disclaimer";

export function TrademarkDisclaimer(): React.ReactElement | null {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(TM_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;
  return (
    <div
      data-testid="tm-disclaimer"
      className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
    >
      <span className="flex-1">
        Trademark hits are a starting signal, not legal advice. Class-specific +
        jurisdiction-specific review still required.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(TM_KEY, "1");
          } catch {
            // ignore
          }
          setVisible(false);
        }}
        aria-label="Dismiss disclaimer"
        className="shrink-0 text-amber-700 hover:opacity-70 dark:text-amber-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
