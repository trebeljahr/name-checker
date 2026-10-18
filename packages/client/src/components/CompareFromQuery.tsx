"use client";

import { useSearchParams } from "next/navigation";
import { CompareForm } from "@/components/CompareForm";

export function parseQueries(raw: string[]): string[] {
  return raw
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10);
}

export function CompareFromQuery(): React.ReactElement {
  const params = useSearchParams();
  // CompareForm reads these once, on mount; its own runs rewrite `?names=`.
  return <CompareForm initialQueries={parseQueries(params.getAll("names"))} />;
}
