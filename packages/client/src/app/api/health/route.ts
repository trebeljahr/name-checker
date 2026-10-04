import { getDb } from "@/lib/db";
import { createCheckJobStore } from "@/lib/check-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.BETTER_AUTH_URL ||
        (process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32)
    ) {
      throw new Error("auth configuration unavailable");
    }
    const db = getDb();
    createCheckJobStore(db);
    // A rendered homepage says nothing about the shared writable account/job
    // database. This requires a writer lock without changing an application row.
    db.prepare("UPDATE check_request_buckets SET count = count WHERE 0").run();
    return Response.json(
      { status: "ok", checksProtocol: 1 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
