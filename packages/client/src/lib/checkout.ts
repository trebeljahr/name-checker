import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getDb } from "./db";
import { withBillingLease } from "./billing-store";
import { ensureStripeCustomer, getStripe } from "./stripe";

// Stripe can prune idempotency keys after 24 hours. Stop replaying before then.
export const CHECKOUT_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
// A stored session URL is reused only while the customer can still finish it.
const REUSE_MARGIN_MS = 5 * 60 * 1000;

type CheckoutParams = Stripe.Checkout.SessionCreateParams;
type CheckoutRow = {
  request_id: string;
  params: string;
  created_at: number;
  session_id: string | null;
  session_url: string | null;
  session_expires_at: number | null;
};

export class CheckoutHeldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutHeldError";
  }
}

function database() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS billing_checkout_requests (
    user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL UNIQUE, params TEXT NOT NULL, created_at INTEGER NOT NULL,
    session_id TEXT, session_url TEXT, session_expires_at INTEGER
  )`);
  return db;
}

function readRow(userId: string): CheckoutRow | undefined {
  return database().prepare(`SELECT request_id, params, created_at, session_id,
    session_url, session_expires_at FROM billing_checkout_requests WHERE user_id = ?`)
    .get(userId) as CheckoutRow | undefined;
}

// Stripe answered and executed nothing: a 4xx other than an idempotency conflict.
// Timeouts, connection failures, 5xx and idempotency errors stay ambiguous.
function definitelyNotCreated(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { statusCode, type } = err as { statusCode?: unknown; type?: unknown };
  if (typeof statusCode !== "number" || statusCode < 400 || statusCode >= 500) return false;
  return statusCode !== 409 && type !== "StripeIdempotencyError" && type !== "StripeConnectionError";
}

export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
  priceId: string;
  baseUrl: string;
}): Promise<string> {
  const { userId } = opts;
  const customerId = await ensureStripeCustomer(userId, opts.email);
  return withBillingLease(`checkout:${userId}`, async (commit) => {
    const request = commit(() => {
      const row = readRow(userId);
      if (row?.session_url && (row.session_expires_at ?? 0) - REUSE_MARGIN_MS > Date.now()) return row;
      if (row && !row.session_id) return row;
      // No request yet, or the previous session is known and expired. Persist the
      // new key and exact parameters before Stripe sees anything.
      const params: CheckoutParams = {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: opts.priceId, quantity: 1 }],
        success_url: `${opts.baseUrl}/account?billing=success`,
        cancel_url: `${opts.baseUrl}/pricing?billing=cancelled`,
        allow_promotion_codes: true,
        client_reference_id: userId,
        metadata: { userId },
      };
      const fresh: CheckoutRow = {
        request_id: randomUUID(), params: JSON.stringify(params), created_at: Date.now(),
        session_id: null, session_url: null, session_expires_at: null,
      };
      database().prepare(`INSERT INTO billing_checkout_requests VALUES (?, ?, ?, ?, NULL, NULL, NULL)
        ON CONFLICT(user_id) DO UPDATE SET request_id = excluded.request_id, params = excluded.params,
        created_at = excluded.created_at, session_id = NULL, session_url = NULL, session_expires_at = NULL`)
        .run(userId, fresh.request_id, fresh.params, fresh.created_at);
      return fresh;
    });
    if (request.session_url) return request.session_url;
    // An unresolved request is replayed with its original key and parameters, never
    // replaced. After the replay window it needs operator reconciliation.
    if (Date.now() - request.created_at >= CHECKOUT_REPLAY_WINDOW_MS) {
      throw new CheckoutHeldError("Checkout requires reconciliation");
    }
    let session: Stripe.Checkout.Session;
    try {
      session = await getStripe().checkout.sessions.create(
        JSON.parse(request.params) as CheckoutParams,
        { idempotencyKey: request.request_id },
      );
    } catch (err) {
      if (definitelyNotCreated(err)) {
        commit(() => database().prepare(`DELETE FROM billing_checkout_requests
          WHERE user_id = ? AND request_id = ? AND session_id IS NULL`).run(userId, request.request_id));
      }
      throw err;
    }
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    const url = session.url;
    return commit(() => {
      const result = database().prepare(`UPDATE billing_checkout_requests
        SET session_id = ?, session_url = ?, session_expires_at = ?
        WHERE user_id = ? AND request_id = ? AND session_id IS NULL`)
        .run(session.id, url, session.expires_at * 1000, userId, request.request_id);
      if (result.changes !== 1) throw new Error("Checkout request changed");
      return url;
    });
  });
}
