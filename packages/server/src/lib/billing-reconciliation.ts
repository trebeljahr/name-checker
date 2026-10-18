import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { getDb } from "./db";
import { billingEventProcessed, recordBillingEvent, withBillingLease } from "./billing-store";

function itemEnd(sub: Stripe.Subscription, item: Stripe.SubscriptionItem): number | null {
  const seconds = item.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  let end = seconds * 1000;
  if (sub.status === "trialing") {
    if (typeof sub.trial_end !== "number" || !Number.isFinite(sub.trial_end)) return null;
    end = Math.min(end, sub.trial_end * 1000);
  }
  if (typeof sub.cancel_at === "number") end = Math.min(end, sub.cancel_at * 1000);
  return Number.isFinite(new Date(end).getTime()) && end > Date.now() ? end : null;
}

export async function reconcileBillingCustomer(customerId: string, eventId: string): Promise<void> {
  await withBillingLease(`reconcile:${customerId}`, async (commit) => {
    if (commit(() => billingEventProcessed(eventId))) return;
    const row = commit(() => getDb().prepare(
      "SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?",
    ).all(customerId)) as { user_id: string }[];
    // Unknown or ambiguous mappings must not be silently acknowledged as paid.
    if (row.length !== 1) throw new Error("Billing customer mapping requires reconciliation");
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) throw new Error("STRIPE_PRO_PRICE_ID is not configured");
    const stripe = getStripe();
    let best: { id: string; end: number } | null = null;
    let cursor: string | undefined;
    do {
      commit(() => undefined);
      const page = await stripe.subscriptions.list({
        customer: customerId, status: "all", limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      });
      for (const sub of page.data) {
        const owner = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (owner !== customerId) throw new Error("Billing subscription customer mismatch");
        if (sub.status !== "active" && sub.status !== "trialing") continue;
        let items = sub.items;
        let itemCursor: string | undefined;
        do {
          for (const item of items.data) {
            if (item.price.id !== priceId) continue;
            const end = itemEnd(sub, item);
            if (end !== null && (!best || end > best.end || (end === best.end && sub.id < best.id))) {
              best = { id: sub.id, end };
            }
          }
          if (!items.has_more) break;
          const last = items.data.at(-1)?.id;
          if (!last || last === itemCursor) throw new Error("Invalid billing item pagination");
          itemCursor = last;
          commit(() => undefined);
          items = await stripe.subscriptionItems.list({ subscription: sub.id, limit: 100, starting_after: last });
        } while (true);
      }
      if (!page.has_more) break;
      const last = page.data.at(-1)?.id;
      if (!last || last === cursor) throw new Error("Invalid billing subscription pagination");
      cursor = last;
    } while (true);
    commit(() => {
      // Any qualifying subscription grants Pro; an unrelated cancellation cannot
      // revoke another subscription. Periods are never added together.
      const result = getDb().prepare(`UPDATE subscriptions
        SET stripe_sub_id = ?, plan = ?, current_period_end = ?, updated_at = datetime('now')
        WHERE user_id = ? AND stripe_customer_id = ?`)
        .run(best?.id ?? null, best ? "pro" : "free", best ? new Date(best.end).toISOString() : null,
          row[0].user_id, customerId);
      if (result.changes !== 1) throw new Error("Billing customer mapping changed");
      recordBillingEvent(eventId);
    });
  });
}
