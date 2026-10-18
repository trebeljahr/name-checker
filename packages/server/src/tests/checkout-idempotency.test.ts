import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stripe is faked; no network, keys or purchases are involved.
const mocks = vi.hoisted(() => ({ checkout: vi.fn(), customer: vi.fn(), session: vi.fn() }));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: mocks.checkout } };
  customers = { create: mocks.customer };
} }));
vi.mock("../lib/session", () => ({ getSessionFromRequest: mocks.session }));
vi.mock("../lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY);
    INSERT INTO user VALUES ('alice');
    CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY REFERENCES user(id),
      stripe_customer_id TEXT, stripe_sub_id TEXT, plan TEXT NOT NULL DEFAULT 'free',
      current_period_end TEXT, updated_at TEXT);`);
  return { getDb: () => db };
});
import { getDb } from "../lib/db";
import { createCheckoutSession } from "../lib/checkout";
import { withBillingLease } from "../lib/billing-store";
import { POST } from "../routes/billing/checkout";

const now = 1_800_000_000_000;
const hour = 60 * 60 * 1000;
type Row = { request_id: string; params: string; session_id: string | null; session_url: string | null };

function row(): Row | undefined {
  getDb().exec(`CREATE TABLE IF NOT EXISTS billing_checkout_requests (user_id TEXT PRIMARY KEY,
    request_id TEXT, params TEXT, created_at INTEGER, session_id TEXT, session_url TEXT, session_expires_at INTEGER)`);
  return getDb().prepare("SELECT * FROM billing_checkout_requests WHERE user_id = 'alice'").get() as Row | undefined;
}
function stripeSession(id: string, expiresAt = now + 24 * hour) {
  return { id, url: `https://checkout.stripe.test/${id}`, expires_at: Math.floor(expiresAt / 1000) };
}
function stripeError(statusCode: number, type: string) {
  return Object.assign(new Error(`fake ${type}`), { statusCode, type });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function checkout(): Promise<Response> {
  return POST(new Request("https://app.test/api/billing/checkout", { method: "POST" }));
}
function keys(): string[] {
  return mocks.checkout.mock.calls.map((call) => (call[1] as { idempotencyKey: string }).idempotencyKey);
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "fake-key");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  mocks.session.mockResolvedValue({ user: { id: "alice", email: "alice@example.test" } });
  // The module recreates its table; billing locks come from the shared lease store.
  await withBillingLease("init", async () => undefined);
  getDb().exec(`DROP TABLE IF EXISTS billing_checkout_requests; DELETE FROM billing_locks;
    DELETE FROM subscriptions;
    INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES ('alice', 'cus_alice');`);
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); getDb().close(); });

describe("checkout idempotency", () => {
  it("rejects anonymous requests before touching Stripe", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await checkout()).status).toBe(401);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("persists the key and exact parameters before calling Stripe", async () => {
    mocks.checkout.mockImplementation(async (params: unknown, options: { idempotencyKey: string }) => {
      const saved = row();
      expect(saved).toMatchObject({ request_id: options.idempotencyKey, session_id: null });
      expect(JSON.parse(saved!.params)).toEqual(params);
      return stripeSession("cs_first");
    });
    const res = await checkout();
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_first" });
    expect(mocks.checkout.mock.calls[0][0]).toMatchObject({
      customer: "cus_alice", line_items: [{ price: "price_pro", quantity: 1 }],
      success_url: "https://app.test/account?billing=success", metadata: { userId: "alice" },
    });
    expect(row()?.session_id).toBe("cs_first");
  });

  it("replays the original request after a lost response and then reuses its result", async () => {
    mocks.checkout.mockRejectedValueOnce(stripeError(0, "StripeConnectionError"))
      .mockResolvedValueOnce(stripeSession("cs_recovered"));
    expect((await checkout()).status).toBe(502);
    // Configuration drift must not alter an outstanding request's parameters.
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_changed");
    expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.test/cs_recovered" });
    expect(mocks.checkout.mock.calls[1]).toEqual(mocks.checkout.mock.calls[0]);
    expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.test/cs_recovered" });
    expect(mocks.checkout).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["server error", stripeError(500, "StripeAPIError")],
    ["idempotency conflict", stripeError(409, "StripeIdempotencyError")],
    ["parameter mismatch", stripeError(400, "StripeIdempotencyError")],
    ["timeout", new Error("fake timeout")],
  ])("keeps the request outstanding after an ambiguous %s", async (_name, error) => {
    mocks.checkout.mockRejectedValueOnce(error).mockResolvedValueOnce(stripeSession("cs_same"));
    expect((await checkout()).status).toBe(502);
    const saved = row();
    expect(saved?.session_id).toBeNull();
    await checkout();
    expect(new Set(keys())).toEqual(new Set([saved!.request_id]));
  });

  it("starts a new request only after Stripe definitively executed nothing", async () => {
    mocks.checkout.mockRejectedValueOnce(stripeError(400, "StripeInvalidRequestError"))
      .mockResolvedValueOnce(stripeSession("cs_fixed"));
    expect((await checkout()).status).toBe(502);
    expect(row()).toBeUndefined();
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_fixed");
    await checkout();
    expect(new Set(keys()).size).toBe(2);
    expect(mocks.checkout.mock.calls[1][0].line_items).toEqual([{ price: "price_fixed", quantity: 1 }]);
  });

  it("holds an unresolved request beyond Stripe's idempotency retention", async () => {
    mocks.checkout.mockRejectedValueOnce(new Error("fake timeout"));
    await checkout();
    vi.mocked(Date.now).mockReturnValue(now + 23 * hour);
    const res = await checkout();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/support review/);
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
    expect(row()?.session_id).toBeNull();
  });

  it("mints a new request only after the known session has expired", async () => {
    mocks.checkout.mockResolvedValueOnce(stripeSession("cs_old", now + hour))
      .mockResolvedValueOnce(stripeSession("cs_new", now + 26 * hour));
    await checkout();
    vi.mocked(Date.now).mockReturnValue(now + hour - 6 * 60 * 1000);
    expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.test/cs_old" });
    vi.mocked(Date.now).mockReturnValue(now + hour);
    expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.test/cs_new" });
    expect(new Set(keys()).size).toBe(2);
  });

  it("serializes concurrent requests", async () => {
    const pending = deferred<ReturnType<typeof stripeSession>>();
    mocks.checkout.mockReturnValueOnce(pending.promise);
    const first = checkout();
    await vi.waitFor(() => expect(mocks.checkout).toHaveBeenCalledTimes(1));
    expect((await checkout()).status).toBe(409);
    pending.resolve(stripeSession("cs_once"));
    expect((await first).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  });

  it("lets a successor replay the same key and fences the late worker", async () => {
    const pending = deferred<ReturnType<typeof stripeSession>>();
    mocks.checkout.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(stripeSession("cs_shared"));
    const first = createCheckoutSession({ userId: "alice", email: "a@example.test", priceId: "price_pro", baseUrl: "https://app.test" });
    const rejected = expect(first).rejects.toThrow("lease expired");
    await vi.waitFor(() => expect(mocks.checkout).toHaveBeenCalledTimes(1));
    vi.mocked(Date.now).mockReturnValue(now + 120_001);
    expect(await (await checkout()).json()).toEqual({ url: "https://checkout.stripe.test/cs_shared" });
    pending.resolve(stripeSession("cs_shared"));
    await rejected;
    expect(new Set(keys()).size).toBe(1);
    expect(row()?.session_id).toBe("cs_shared");
  });
});
