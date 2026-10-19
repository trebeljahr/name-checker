"use client";

import { ErrorView } from "@/components/ErrorView";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return <ErrorView error={error} reset={reset} boundary="boundary" />;
}
