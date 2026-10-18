import { getSessionFromRequest } from "../lib/session";
import { getUserPlan, getRunsToday } from "../lib/plan";

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ authenticated: false });
  }
  const plan = getUserPlan(session.user.id);
  return Response.json({
    authenticated: true,
    user: session.user,
    plan,
    runsToday: getRunsToday(session.user.id),
  });
}
