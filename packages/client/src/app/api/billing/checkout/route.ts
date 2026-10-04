import { NextResponse } from "next/server";
import { CheckoutHeldError, createCheckoutSession } from "@/lib/checkout";
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

  try {
    const url = await createCheckoutSession({
      userId: session.user.id,
      email: session.user.email,
      priceId,
      baseUrl,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof CheckoutHeldError) {
      return NextResponse.json({ error: "A previous checkout needs support review before another can start." }, { status: 409 });
    }
    if (err instanceof Error && err.message.includes("already in progress")) {
      return NextResponse.json({ error: "Checkout is already starting in another tab." }, { status: 409 });
    }
    // The durable request is kept; the next attempt replays the same Stripe request.
    console.error("[billing] checkout failed", err);
    return NextResponse.json({ error: "Checkout could not start. Try again." }, { status: 502 });
  }
}
