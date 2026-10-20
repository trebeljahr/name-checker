import { getDb } from "./db";
import type { Plan } from "@starter/shared/plan-constants";

export type { Plan } from "@starter/shared/plan-constants";

type SubscriptionRow = {
  user_id: string;
  plan: string;
  current_period_end: string | null;
};

/**
 * The plan a Stripe subscription paid for. Billing is dormant: no route
 * gates a feature on this. It stays with the Stripe code so a priced tier
 * can come back if measured costs need one.
 */
export function getUserPlan(userId: string): Plan {
  const row = getDb()
    .prepare<[string], SubscriptionRow>(
      "SELECT user_id, plan, current_period_end FROM subscriptions WHERE user_id = ?",
    )
    .get(userId);
  if (!row || row.plan !== "pro") return "free";
  const end = row.current_period_end ? Date.parse(row.current_period_end) : NaN;
  if (!Number.isFinite(end) || end <= Date.now()) return "free";
  return "pro";
}
