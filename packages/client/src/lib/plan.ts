import { getDb } from "./db";
import { getSessionFromRequest, type SessionUser } from "./session";
import {
  FREE_NAMES_PER_REQUEST,
  FREE_RUNS_PER_DAY,
  type Plan,
} from "./plan-constants";

export {
  FREE_NAMES_PER_REQUEST,
  FREE_RUNS_PER_DAY,
} from "./plan-constants";
export type { Plan } from "./plan-constants";

type SubscriptionRow = {
  user_id: string;
  plan: string;
  current_period_end: string | null;
};

export function getUserPlan(userId: string): Plan {
  const row = getDb()
    .prepare<[string], SubscriptionRow>(
      "SELECT user_id, plan, current_period_end FROM subscriptions WHERE user_id = ?",
    )
    .get(userId);
  if (!row || row.plan !== "pro") return "free";
  if (row.current_period_end) {
    const end = Date.parse(row.current_period_end);
    if (Number.isFinite(end) && end < Date.now()) return "free";
  }
  return "pro";
}

export type RequirePlanResult =
  | { ok: true; user: SessionUser; plan: Plan }
  | { ok: false; status: 401 | 402; body: Record<string, unknown> };

export async function requirePlan(
  req: Request,
): Promise<RequirePlanResult> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return {
      ok: false,
      status: 401,
      body: { error: "unauthenticated", signInUrl: "/sign-in" },
    };
  }
  return { ok: true, user: session.user, plan: getUserPlan(session.user.id) };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getRunsToday(userId: string): number {
  const row = getDb()
    .prepare<[string, string], { runs: number }>(
      "SELECT runs FROM usage_log WHERE user_id = ? AND day = ?",
    )
    .get(userId, today());
  return row?.runs ?? 0;
}

export function recordRun(userId: string): void {
  getDb()
    .prepare(
      `INSERT INTO usage_log (user_id, day, runs) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET runs = runs + 1`,
    )
    .run(userId, today());
}

export type BulkLimitCheck =
  | { ok: true }
  | { ok: false; status: 402; body: Record<string, unknown> };

export function enforceBulkLimits(
  plan: Plan,
  userId: string,
  nameCount: number,
): BulkLimitCheck {
  if (plan === "pro") return { ok: true };
  if (nameCount > FREE_NAMES_PER_REQUEST) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "free_limit_size",
        limit: FREE_NAMES_PER_REQUEST,
        upgradeUrl: "/pricing",
      },
    };
  }
  if (getRunsToday(userId) >= FREE_RUNS_PER_DAY) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "free_limit_runs",
        limit: FREE_RUNS_PER_DAY,
        upgradeUrl: "/pricing",
      },
    };
  }
  return { ok: true };
}
