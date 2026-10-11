import { BUILD_COMMIT } from "@/lib/build-identity";

export const dynamic = "force-dynamic";

// A release check compares this with the commit it just deployed.
export function GET(): Response {
  return Response.json(
    { commit: BUILD_COMMIT },
    { headers: { "cache-control": "no-store" } },
  );
}
