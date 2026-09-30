import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ list: vi.fn(), items: vi.fn(), create: vi.fn(), verify: vi.fn() }));
vi.mock("stripe", () => ({ default: class {
  subscriptions = { list: mocks.list };
  subscriptionItems = { list: mocks.items };
  customers = { create: mocks.create };
  webhooks = { constructEvent: mocks.verify };
} }));
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
import { ensureStripeCustomer } from "../lib/stripe";
import { billingEventProcessed, withBillingLease } from "../lib/billing-store";
import { reconcileBillingCustomer } from "../lib/billing-reconciliation";
import { POST } from "../app/api/billing/webhook/route";

const now = 1_800_000_000_000;
const end = now / 1000 + 3600;
function subscription(id: string, price = "price_pro", status = "active", until = end) {
  return { id, customer: "cus_alice", status, trial_end: until, cancel_at: null,
    items: { data: [{ id: `si_${id}`, price: { id: price }, current_period_end: until }], has_more: false },
  } as unknown as Stripe.Subscription;
}
function page(data: Stripe.Subscription[], has_more = false) { return { data, has_more }; }
function row() {
  return getDb().prepare("SELECT * FROM subscriptions WHERE user_id = 'alice'").get() as {
    plan: string; stripe_sub_id: string | null; current_period_end: string | null; stripe_customer_id: string | null;
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function request() {
  return new Request("https://example.test/api/billing/webhook", {
    method: "POST", headers: { "stripe-signature": "fake-signature" }, body: "fake-body",
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("STRIPE_SECRET_KEY", "fake-key");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fake-secret");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  // Initialize only fake in-memory billing tables. No dotenv, auth DB or provider.
  await withBillingLease("init", async () => undefined);
  getDb().exec(`DELETE FROM billing_events; DELETE FROM billing_locks;
    DELETE FROM billing_customer_requests; DELETE FROM subscriptions;
    INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES ('alice', 'cus_alice');`);
  mocks.list.mockResolvedValue(page([]));
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); getDb().close(); });

describe("billing reconciliation", () => {
  it("verifies the raw body and rejects unsigned input before reconciliation", async () => {
    mocks.verify.mockImplementation(() => { throw new Error("fake invalid signature"); });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.verify).toHaveBeenCalledWith("fake-body", "fake-signature", "fake-secret");
    expect(mocks.list).not.toHaveBeenCalled();
    expect((await POST(new Request("https://example.test", { method: "POST" }))).status).toBe(400);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  });
  it("uses current customer state for stale snapshots and ignores processed duplicate events", async () => {
    mocks.list.mockResolvedValue(page([subscription("paid")]));
    await reconcileBillingCustomer("cus_alice", "evt_paid");
    expect(row().plan).toBe("pro");
    mocks.list.mockResolvedValue(page([]));
    await reconcileBillingCustomer("cus_alice", "evt_cancel");
    // Delivery order and snapshot status do not affect authoritative reconciliation.
    mocks.verify.mockReturnValue({ id: "evt_old_active", type: "customer.subscription.updated",
      data: { object: subscription("paid") } });
    expect((await POST(request())).status).toBe(200);
    expect(row().plan).toBe("free");
    const calls = mocks.list.mock.calls.length;
    await reconcileBillingCustomer("cus_alice", "evt_paid");
    expect(mocks.list).toHaveBeenCalledTimes(calls);
    expect(row().plan).toBe("free");
  });
  it("keeps another qualifying subscription when one is canceled, without adding periods", async () => {
    mocks.list.mockResolvedValue(page([
      subscription("canceled", "price_pro", "canceled", end + 5000),
      subscription("other", "price_other", "active", end + 8000),
      subscription("short"), subscription("long", "price_pro", "trialing", end + 1000),
    ]));
    await reconcileBillingCustomer("cus_alice", "evt_multi");
    expect(row()).toMatchObject({ plan: "pro", stripe_sub_id: "long", current_period_end: new Date((end + 1000) * 1000).toISOString() });
  });
  it("reads all subscription and item pages and uses the Pro item period", async () => {
    const mixed = subscription("mixed", "price_other");
    mixed.items.has_more = true;
    mocks.list.mockResolvedValueOnce(page([subscription("unrelated", "price_other")], true))
      .mockResolvedValueOnce(page([mixed]));
    mocks.items.mockResolvedValue({ data: subscription("pro").items.data, has_more: false });
    await reconcileBillingCustomer("cus_alice", "evt_pages");
    expect(row()).toMatchObject({ plan: "pro", stripe_sub_id: "mixed" });
    expect(mocks.list.mock.calls[1][0].starting_after).toBe("unrelated");
    expect(mocks.items).toHaveBeenCalledWith({ subscription: "mixed", limit: 100, starting_after: "si_mixed" });
  });
  it("rejects ineligible statuses, prices, expired periods and missing configuration", async () => {
    mocks.list.mockResolvedValue(page([
      subscription("wrong", "price_other"), subscription("late", "price_pro", "past_due"),
      subscription("expired", "price_pro", "active", now / 1000),
      subscription("invalid", "price_pro", "active", NaN),
    ]));
    await reconcileBillingCustomer("cus_alice", "evt_denied");
    expect(row().plan).toBe("free");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    await expect(reconcileBillingCustomer("cus_alice", "evt_missing")).rejects.toThrow("not configured");
    expect(billingEventProcessed("evt_missing")).toBe(false);
  });
  it("caps access at trial end and scheduled cancellation", async () => {
    const trial = subscription("trial", "price_pro", "trialing");
    trial.trial_end = end - 1000;
    trial.cancel_at = end - 2000;
    mocks.list.mockResolvedValue(page([trial]));
    await reconcileBillingCustomer("cus_alice", "evt_trial");
    expect(row().current_period_end).toBe(new Date((end - 2000) * 1000).toISOString());
  });
  it("retries failed reads and missing customer mappings without recording success", async () => {
    mocks.list.mockRejectedValue(new Error("fake provider failure"));
    mocks.verify.mockReturnValue({ id: "evt_failure", type: "invoice.paid", data: { object: { customer: "cus_alice" } } });
    expect((await POST(request())).status).toBe(503);
    expect(billingEventProcessed("evt_failure")).toBe(false);
    await expect(reconcileBillingCustomer("unknown", "evt_unknown")).rejects.toThrow("mapping");
    expect(billingEventProcessed("evt_unknown")).toBe(false);
  });
  it("serializes workers and rejects a late write after lease takeover", async () => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.list.mockReturnValueOnce(pending.promise);
    const first = reconcileBillingCustomer("cus_alice", "evt_slow");
    const rejected = expect(first).rejects.toThrow("lease expired");
    await expect(reconcileBillingCustomer("cus_alice", "evt_busy")).rejects.toThrow("in progress");
    vi.mocked(Date.now).mockReturnValue(now + 120_001);
    mocks.list.mockResolvedValue(page([]));
    await reconcileBillingCustomer("cus_alice", "evt_new");
    pending.resolve(page([subscription("old")]));
    await rejected;
    expect(row().plan).toBe("free");
    expect(billingEventProcessed("evt_slow")).toBe(false);
    expect(billingEventProcessed("evt_new")).toBe(true);
  });
  it("rolls back entitlement writes if event acknowledgement cannot commit", async () => {
    mocks.list.mockResolvedValue(page([subscription("paid")]));
    getDb().exec(`CREATE TRIGGER reject_event BEFORE INSERT ON billing_events
      BEGIN SELECT RAISE(ABORT, 'fake write failure'); END;`);
    try {
      await expect(reconcileBillingCustomer("cus_alice", "evt_rollback")).rejects.toThrow("fake write failure");
      expect(row().plan).toBe("free");
      expect(billingEventProcessed("evt_rollback")).toBe(false);
    } finally { getDb().exec("DROP TRIGGER reject_event"); }
  });
  it("never applies a partial paginated result after a later page fails", async () => {
    mocks.list.mockResolvedValueOnce(page([subscription("paid")], true))
      .mockRejectedValueOnce(new Error("fake second-page failure"));
    await expect(reconcileBillingCustomer("cus_alice", "evt_partial")).rejects.toThrow("second-page");
    expect(row().plan).toBe("free");
    expect(billingEventProcessed("evt_partial")).toBe(false);
  });
});

describe("customer creation", () => {
  beforeEach(() => getDb().exec("UPDATE subscriptions SET stripe_customer_id = NULL"));
  it("serializes initial requests and returns only the persisted mapping", async () => {
    const pending = deferred<{ id: string }>();
    mocks.create.mockReturnValue(pending.promise);
    const first = ensureStripeCustomer("alice", "alice@example.test");
    await expect(ensureStripeCustomer("alice", "alice@example.test")).rejects.toThrow("in progress");
    pending.resolve({ id: "cus_new" });
    expect(await first).toBe("cus_new");
    expect(await ensureStripeCustomer("alice", "changed@example.test")).toBe("cus_new");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(row().stripe_customer_id).toBe("cus_new");
  });
  it("reuses the persisted key and original parameters after an ambiguous failure", async () => {
    mocks.create.mockRejectedValueOnce(new Error("fake timeout")).mockResolvedValueOnce({ id: "cus_recovered" });
    await expect(ensureStripeCustomer("alice", "first@example.test")).rejects.toThrow("fake timeout");
    expect(await ensureStripeCustomer("alice", "changed@example.test")).toBe("cus_recovered");
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it("does not create again beyond the idempotency retention window", async () => {
    mocks.create.mockRejectedValueOnce(new Error("fake timeout"));
    await expect(ensureStripeCustomer("alice", "alice@example.test")).rejects.toThrow();
    vi.mocked(Date.now).mockReturnValue(now + 23 * 60 * 60 * 1000);
    await expect(ensureStripeCustomer("alice", "alice@example.test")).rejects.toThrow("requires reconciliation");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
