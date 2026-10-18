import { ensureStripeCustomer, getStripe } from "../../lib/stripe";
import { getSessionFromRequest } from "../../lib/session";

export async function POST(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    new URL(req.url).origin;

  const customerId = await ensureStripeCustomer(
    session.user.id,
    session.user.email,
  );

  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/account`,
  });
  return Response.json({ url: portal.url });
}
