import Stripe from "stripe";
import { getDb } from "./db";
import { customerRequest, withBillingLease } from "./billing-store";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  cached = new Stripe(key, { timeout: 20_000, maxNetworkRetries: 1 });
  return cached;
}

export function getOrCreateSubscriptionRow(userId: string): {
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  plan: string;
} {
  const db = getDb();
  const row = db
    .prepare<
      [string],
      {
        stripe_customer_id: string | null;
        stripe_sub_id: string | null;
        plan: string;
      }
    >(
      "SELECT stripe_customer_id, stripe_sub_id, plan FROM subscriptions WHERE user_id = ?",
    )
    .get(userId);
  if (row) return row;
  db.prepare(
    "INSERT INTO subscriptions (user_id, plan) VALUES (?, 'free') ON CONFLICT(user_id) DO NOTHING",
  ).run(userId);
  return { stripe_customer_id: null, stripe_sub_id: null, plan: "free" };
}

export async function ensureStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  return withBillingLease(`customer:${userId}`, async (commit) => {
    const existing = commit(() => getOrCreateSubscriptionRow(userId));
    if (existing.stripe_customer_id) return existing.stripe_customer_id;
    const request = commit(() => customerRequest(userId, email));
    // Stripe can prune idempotency keys after 24 hours. An ambiguous old request
    // must be reconciled by an operator, never retried as a new customer creation.
    if (Date.now() - request.created_at >= 23 * 60 * 60 * 1000) {
      throw new Error("Billing customer creation requires reconciliation");
    }
    const customer = await getStripe().customers.create({
      email: request.email,
      metadata: { userId },
    }, { idempotencyKey: request.request_id });
    return commit(() => {
      const result = getDb().prepare(`UPDATE subscriptions
        SET stripe_customer_id = ?, updated_at = datetime('now')
        WHERE user_id = ? AND stripe_customer_id IS NULL`).run(customer.id, userId);
      if (result.changes !== 1) throw new Error("Billing customer mapping changed");
      return customer.id;
    });
  });
}
