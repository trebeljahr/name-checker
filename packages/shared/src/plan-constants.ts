// Billing is dormant: no page offers a paid plan and no feature checks one.
// The Stripe code (server lib/stripe.ts, lib/checkout.ts, routes/billing/*)
// still uses this type, so a priced tier can return if measured costs need it.
// The fair-use limits live in ./limits.ts.
export type Plan = "free" | "pro";
