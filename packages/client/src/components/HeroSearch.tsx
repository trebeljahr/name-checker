"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";

type Props = {
  placeholder?: string;
  size?: "lg" | "md";
};

export function HeroSearch({
  placeholder = "kairosprotocol",
  size = "lg",
}: Props): React.ReactElement {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      router.push("/check");
      return;
    }
    router.push(`/check/${encodeURIComponent(q)}`);
  }

  const big = size === "lg";

  return (
    <form
      onSubmit={submit}
      className={`group relative mx-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-zinc-300 bg-white/80 p-2 shadow-2xl shadow-emerald-500/5 backdrop-blur transition-colors focus-within:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus-within:border-zinc-600 ${
        big ? "" : ""
      }`}
    >
      <Search
        aria-hidden
        className={`ml-3 shrink-0 text-zinc-500 dark:text-zinc-500 ${big ? "h-5 w-5" : "h-4 w-4"}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus={big}
        aria-label="Name to check"
        className={`min-w-0 flex-1 bg-transparent font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-600 ${
          big ? "px-1 py-3 text-lg" : "px-1 py-2 text-base"
        }`}
      />
      <button
        type="submit"
        className={`inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-500 font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-300 hover:to-emerald-400 ${
          big ? "px-5 py-3 text-base" : "px-4 py-2 text-sm"
        }`}
      >
        Check name
        <ArrowRight className={big ? "h-4 w-4" : "h-3.5 w-3.5"} />
      </button>
    </form>
  );
}
