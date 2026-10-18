import { getSessionFromRequest } from "./session";
import { getUserPlan } from "./plan";

export type PassportSession = {
  userId: string;
  plan: "free" | "pro";
  signedIn: true;
};

// Anonymous drafts stay in the browser; legacy passport_uid is never identity.
export async function readPassportSession(req: Request): Promise<PassportSession | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  return { userId: session.user.id, plan: getUserPlan(session.user.id), signedIn: true };
}
