import Stripe from "stripe";
import { getDb } from "./db";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  cached = new Stripe(key);
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
    "INSERT INTO subscriptions (user_id, plan) VALUES (?, 'free')",
  ).run(userId);
  return { stripe_customer_id: null, stripe_sub_id: null, plan: "free" };
}

export async function ensureStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const db = getDb();
  const existing = getOrCreateSubscriptionRow(userId);
  if (existing.stripe_customer_id) return existing.stripe_customer_id;
  const customer = await getStripe().customers.create({
    email,
    metadata: { userId },
  });
  db.prepare(
    "UPDATE subscriptions SET stripe_customer_id = ?, updated_at = datetime('now') WHERE user_id = ?",
  ).run(customer.id, userId);
  return customer.id;
}

export function setSubscriptionByCustomer(
  customerId: string,
  data: {
    stripeSubId: string | null;
    plan: "free" | "pro";
    currentPeriodEnd: string | null;
  },
): void {
  getDb()
    .prepare(
      `UPDATE subscriptions
         SET stripe_sub_id = ?, plan = ?, current_period_end = ?, updated_at = datetime('now')
       WHERE stripe_customer_id = ?`,
    )
    .run(data.stripeSubId, data.plan, data.currentPeriodEnd, customerId);
}
