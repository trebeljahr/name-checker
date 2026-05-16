import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getUserPlan, getRunsToday } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  const plan = getUserPlan(session.user.id);
  return NextResponse.json({
    authenticated: true,
    user: session.user,
    plan,
    runsToday: getRunsToday(session.user.id),
  });
}
