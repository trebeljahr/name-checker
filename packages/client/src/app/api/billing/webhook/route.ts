import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { reconcileBillingCustomer } from "@/lib/billing-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "webhook verification failed" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      // Signed snapshots identify the customer only. Never grant from stale payloads.
      const object = event.data.object as Stripe.Subscription | Stripe.Invoice;
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (!customerId) return NextResponse.json({ error: "missing customer" }, { status: 400 });
      try {
        await reconcileBillingCustomer(customerId, event.id);
      } catch {
        // Retry contention, failed provider reads, expired leases and missing mappings.
        // Event acknowledgement and entitlement writes commit together on success.
        return NextResponse.json({ error: "billing reconciliation pending" }, { status: 503 });
      }
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
