import { headers } from "next/headers";
import { auth } from "./auth";

export type SessionUser = { id: string; email: string };

export async function getServerSession(): Promise<{
  user: SessionUser;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { user: { id: session.user.id, email: session.user.email } };
}

export async function getSessionFromRequest(
  req: Request,
): Promise<{ user: SessionUser } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return { user: { id: session.user.id, email: session.user.email } };
}
