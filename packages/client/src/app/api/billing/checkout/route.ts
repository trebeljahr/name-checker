import { NextResponse } from "next/server";
import { ensureStripeCustomer, getStripe } from "@/lib/stripe";
import { getSessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRO_PRICE_ID is not configured" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    new URL(req.url).origin;

  const customerId = await ensureStripeCustomer(
    session.user.id,
    session.user.email,
  );

  const checkout = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/account?billing=success`,
    cancel_url: `${baseUrl}/pricing?billing=cancelled`,
    allow_promotion_codes: true,
    client_reference_id: session.user.id,
    metadata: { userId: session.user.id },
  });

  if (!checkout.url) {
    return NextResponse.json(
      { error: "Stripe did not return a checkout URL" },
      { status: 500 },
    );
  }
  return NextResponse.json({ url: checkout.url });
}
