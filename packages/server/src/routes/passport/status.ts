import { readPassportSession } from "../../lib/passport-session";
import { listReservations } from "../../lib/passport-store";

export async function GET(req: Request): Promise<Response> {
  const session = await readPassportSession(req);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim();
  const all = await listReservations(session.userId);
  const filtered = query ? all.filter((r) => r.query === query) : all;
  return Response.json({
    userId: session.userId,
    plan: session.plan,
    reservations: filtered,
  });
}
