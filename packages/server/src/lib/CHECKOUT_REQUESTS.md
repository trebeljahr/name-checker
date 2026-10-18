# Checkout request contract

`POST /api/billing/checkout` keeps one durable Stripe Checkout request per user in
`billing_checkout_requests`. The row holds the idempotency key, the exact
`checkout.sessions.create` parameters, the creation time and, once known, the
session ID, URL and expiry.

The work runs under the same cross-process billing lease as customer creation
(`checkout:<userId>`). The row commits before Stripe is called. Every write after the
network call checks lease ownership in the same transaction, so a worker whose lease
expired cannot overwrite its successor.

- A lost response, timeout, connection failure, 5xx or idempotency error leaves the
  request outstanding. The next attempt replays the same key and the stored
  parameters, even when configuration changed. Stripe returns the original session.
- Only a 4xx other than an idempotency error (Stripe executed nothing) deletes the
  outstanding request, so a fixed configuration can start a new one.
- A known session URL is reused until five minutes before its expiry. A new request
  is minted only after the known session expires.
- Stripe can prune idempotency keys after 24 hours. An outstanding request older than
  23 hours is never replayed or replaced; the route returns 409 and an operator must
  reconcile it.

Operator reconciliation: search Stripe Checkout Sessions for the customer and
`metadata.userId`, created near `created_at`. If a session exists, write its ID, URL
and expiry (milliseconds) into the row; otherwise delete the row. Customer creation
uses the same rule in `billing_customer_requests`.

Tests fake Stripe (`src/tests/checkout-idempotency.test.ts`). No real checkout was
created.
