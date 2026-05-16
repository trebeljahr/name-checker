import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, setSubscriptionByCustomer } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function periodEnd(sub: Stripe.Subscription): string | null {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  if (typeof fromItem === "number") return isoFromUnix(fromItem);
  const legacy = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  return isoFromUnix(legacy);
}

function applySubscription(sub: Stripe.Subscription): void {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const active = sub.status === "active" || sub.status === "trialing";
  setSubscriptionByCustomer(customerId, {
    stripeSubId: sub.id,
    plan: active ? "pro" : "free",
    currentPeriodEnd: periodEnd(sub),
  });
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as {
    subscription?: string | { id: string } | null;
  }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  const parent = (invoice as unknown as {
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null };
    } | null;
  }).parent;
  const ref = parent?.subscription_details?.subscription;
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object") return ref.id;
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json(
      { error: `webhook verification failed: ${msg}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      applySubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      setSubscriptionByCustomer(customerId, {
        stripeSubId: sub.id,
        plan: "free",
        currentPeriodEnd: periodEnd(sub),
      });
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      if (subId) {
        const sub = await getStripe().subscriptions.retrieve(subId);
        applySubscription(sub);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
