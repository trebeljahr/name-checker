# Name Checker security remediation — 2026-09-30

## Verified findings and corrections

- F05 confirmed: Passport previously accepted unsigned `passport_uid` as identity, returned `signedIn: true`, and used global plan switches. A caller who knew another cookie ID could read that identity's reservations. This did not require guessing random IDs.
- Provider mutations were gated off by the default free plan. No evidence of deployed enabling switches or exploitation was collected.
- OAuth state previously lacked current-user, provider, and redirect binding. JSON read/remove/write allowed concurrent callbacks to consume the same state.
- npm publishing could use the server's `NPM_TOKEN` for a public caller when the plan bypass was enabled.
- F13 confirmed vulnerable locked dependencies. The magic-link pre-hijacking prerequisite is absent: password signup is disabled. OIDC-provider and MCP auth plugins are not configured. Package advisory counts are not counts of reachable exploits.
- Next.js runs as a standalone server with default image handling, so the image optimizer advisory could not be dismissed merely because pages do not use `next/image`.

Primary advisory references:
- https://github.com/better-auth/better-auth/security/advisories/GHSA-qq9h-g4jm-xgf3
- https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4

## Local changes

- Every Passport endpoint now obtains identity from Better Auth. Anonymous and forged legacy-cookie requests receive 401. Anonymous UI drafts remain separate from server reservations.
- Paid access comes from the authenticated user's billing row. Missing, invalid, or expired entitlement periods fail closed. Global default-plan and bypass switches no longer grant access.
- Provider actions default off through `PASSPORT_ACTIONS_ENABLED=0`. Enabling requires a configured canonical HTTPS `BETTER_AUTH_URL`; local HTTP is accepted only for 127.0.0.1 outside production. Mutations also require the matching Origin header.
- npm requires an explicit user-supplied token. It never reads server `NPM_TOKEN`.
- Reservations and OAuth state use the auth SQLite database. Reads and writes are scoped to authenticated user IDs. Legacy JSON records are deliberately not imported because their owners were unsigned cookie IDs.
- OAuth state is bound to user, provider, exact callback URI, and a ten-minute expiry. One conditional SQL `DELETE ... RETURNING` consumes state atomically across requests/processes sharing the database. Callback authorization rechecks the current billing entitlement.
- Updated runtime and tooling dependencies, including Next.js 15.5.26, Better Auth 1.7.6, Nodemailer 10.0.12, Sentry 11.1.0, and Vitest 4.1.11. Patched PostCSS and esbuild overrides cover upstream transitive pins.
- Docker context excludes nested env/secret files, databases, data directories, node_modules, and build output. Removed stale Docker COPY instructions for the absent server package. Runtime has a writable `/app/data` directory for SQLite.

## Validation

- Nine targeted Passport regression tests passed with one worker and a 256 MB JavaScript heap limit. Real in-memory SQLite; fake auth responses and provider clients; no external provider calls, dotenv credentials, or keychain access.
- Tests cover anonymous callers, forged `passport_uid`, unpaid callers despite old bypass flags, expired/invalid billing periods, another user's reservations, server-token rejection, disabled integrations, cross-origin requests, redirect tampering, expired state, owner/provider/redirect binding, and simultaneous callbacks. Only one concurrent callback exchanges the code.
- Final production and complete dependency audits: zero reported vulnerabilities. Peer dependency check: no issues. These are local registry results, not a deployed-image audit.
- `git diff --check` passed.
- Full typecheck, package test suites, production build, and Docker build remain unverified. Machine load reached over 200 on ten logical CPUs with about 15 GB swap used. Heavy validation was deferred under the machine resource policy. The short regression file completed in 1.61 seconds; the shared validation lock was released.

## Outstanding validation and rollout

1. When machine resources recover, acquire `/private/tmp/projects-security-heavy-check.lock`, record ownership, and run typecheck, unit tests, and the production build serially. Release only the owned lock. Check the Docker image build separately; no image was built here.
2. Review dependency major-version changes through the build and fake-client tests before deployment. Do not treat a clean advisory audit as compatibility proof.
3. Deploy only with explicit user authorization. No push, PR, publish, provider change, service restart, credential revocation, or production data migration was performed.
4. Configure durable SQLite storage at `AUTH_DB_PATH`; containers use `/app/data/auth.db`. Mount a persistent volume and ensure all replicas use a supported shared database topology. Separate local SQLite files do not share sessions or OAuth state.
5. Verify real Better Auth, signed Stripe webhook delivery, entitlement expiry, and GitHub callback configuration before enabling Passport actions. Keep `PASSPORT_ACTIONS_ENABLED=0` until verification is complete. The existing Compose file does not yet supply auth/billing secrets or a persistent data volume; configure these through the authorized deployment workflow.
6. Preserve legacy reservation JSON for a separately authorized ownership review. Never infer authenticated ownership from a legacy cookie ID. Existing legacy OAuth flows must be restarted.
7. Audit the deployed dependency closure and verify 401/402/503 responses in the target environment with approved test accounts. Local fixes do not establish production remediation.
