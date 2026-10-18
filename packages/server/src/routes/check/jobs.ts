import { createCheckJobsHandler } from "../../lib/check-job-handler";
import { createCheckJobStore } from "../../lib/check-jobs";
import { getDb } from "../../lib/db";
import { getSessionFromRequest } from "../../lib/session";
import { getUserPlan } from "../../lib/plan";
import { getClientIp } from "../../lib/rate-limit-cache";

let handle: ReturnType<typeof createCheckJobsHandler> | undefined;
export async function POST(req: Request): Promise<Response> {
  handle ??= createCheckJobsHandler({
    store: createCheckJobStore(getDb()),
    session: async (request) => {
      const session = await getSessionFromRequest(request);
      return session
        ? { userId: session.user.id, plan: getUserPlan(session.user.id) }
        : null;
    },
    rateIdentity: getClientIp,
    rateLimit:
      process.env.NODE_ENV === "production"
        ? Number(process.env.RATE_LIMIT_PER_HOUR) || 30
        : Number.MAX_SAFE_INTEGER,
  });
  return handle(req);
}
