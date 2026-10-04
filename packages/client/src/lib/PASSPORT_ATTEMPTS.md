# Passport mutation contract

Provider mutations stay behind `PASSPORT_ACTIONS_ENABLED=1`. This contract makes a
mutation recoverable; it does not enable one.

`passport_attempts` holds at most one attempt per user, query and platform. Stages:

- `oauth`: GitHub start created a single-use state. The attempt ID is the state's
  SHA-256, so only the newest redirect can claim it. A new start replaces it.
- `claimed`: one owner holds a 120-second lease and has not changed the provider.
  Expiry means a safe retry.
- `external`: recorded immediately before the provider mutation. Expiry never permits
  a retry, because the provider may have created the name. Reads show the reservation
  as failed with `failureCode: "unknown"`, and new attempts return 409
  `outcome_uncertain`. The owner's late result still resolves the hold. Otherwise
  support checks the provider, writes the result, and deletes the attempt row.

The OAuth callback deletes the state and claims its attempt in one transaction. State
stays single-use; a crash after the claim but before the provider call expires into
a retry instead of a stuck `connecting` row. Writes outside an attempt (validation
failures, soft fallbacks) never overwrite a reserved row or a live or external
attempt.

Bluesky passwords are generated in the browser with `crypto.getRandomValues` and
saved in tab session storage before the request is sent. A storage failure stops the
request. The server never generates or returns a password and never persists it.
The GitHub user lookup has a 10-second timeout, like the other GitHub calls.

The npm publish and unpublish pair counts as one provider mutation.
An interruption anywhere in it is held as `outcome_uncertain`.
