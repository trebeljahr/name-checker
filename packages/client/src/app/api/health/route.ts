import { getDb } from "@/lib/db";
import { createCheckJobStore } from "@/lib/check-jobs";
import { databaseId } from "@/lib/database-identity";

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
    // A container on the wrong volume has a writable database too, an empty
    // one. With AUTH_DB_EXPECTED_ID set it never turns healthy, so Coolify
    // keeps routing to the container that holds the accounts.
    const id = databaseId(db);
    const expected = process.env.AUTH_DB_EXPECTED_ID;
    if (expected && expected !== id) {
      return Response.json(
        { status: "unavailable", reason: "database identity mismatch" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { status: "ok", checksProtocol: 1, databaseId: id },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
