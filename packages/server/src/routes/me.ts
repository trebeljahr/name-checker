import { getSessionFromRequest } from "../lib/session";
import { getRunsToday } from "../lib/limits";

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ authenticated: false });
  }
  return Response.json({
    authenticated: true,
    user: session.user,
    runsToday: getRunsToday(session.user.id),
  });
}
