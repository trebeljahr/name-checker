# Check job recovery contract

`POST /api/check/jobs` is the versioned browser protocol for single, compare and
bulk checks. Its `x-check-jobs-protocol: 1` response prevents a new client from
mistaking a legacy stream for a resumable operation. Legacy endpoints remain for
existing clients; they do not gain resumability retroactively.

The browser saves an immutable input and random operation ID in tab-local
session storage before sending anything. Every retry uses that ID and a monotonic
event cursor. EOF without `done` is an interruption, never successful completion.
Reloaded pages can replay the saved job from the beginning; the recovery controls
can resume or explicitly dismiss it. Account changes abort the active consumer
and hide another account's pending request. A storage failure prevents submission.
CSV labels are preserved as presentation data, separate from provider input.

The shared SQLite transaction creates the job receipt, consumes the shared IP
rate limit and charges a bulk run together. Replaying the same owner/input never
charges another run. Different input with the same ID fails with 409. Authenticated
jobs require the same account on every request, with session revalidation during
streaming. Anonymous jobs use their unguessable UUID as the access capability.

Only a worker holding the current renewable five-second lease can append events
or finish a job. Provider results and query summaries have unique event keys.
The successor reuses completed provider results, including after a crash between
saving a result and publishing its event. Expired workers cannot write or release
a successor's lease. Provider requests are read-only; a request interrupted before
its result commits may run again. This does not promise exactly-once provider
requests.

SIGTERM immediately sets `HATCHKIT_DRAINING=1`, causes a reconnect event and releases
job ownership after cancelling provider requests. Result data and receipts remain
in SQLite for the next process. A provider that ignores its signal cannot hold
the retiring worker alive. The readiness endpoint checks writable SQLite and
production auth configuration; the image probes it every two seconds and drains
for 20 seconds before normal shutdown, within the verified host 30-second budget.

Payloads and events expire after seven days. Small fingerprints/ownership receipts
remain until account deletion so an old ID cannot become a fresh quota charge.
Purging runs during new reservations; expired reads fail even before that sweep.

## Deployment prerequisites

Both replicas must mount the same existing **local directory**, including the
SQLite database, WAL and SHM files, at `/app/data`. Verify the actual Docker volume
identity and the database contents before and after migration. Separate databases,
network filesystems and multiple hosts are unsupported. This is not database HA.
Do not replace the legacy auth volume with an empty volume.

First adoption must account for in-flight legacy streams and legacy quota writers.
New-protocol tests do not certify an arbitrary legacy stream handoff. The old
endpoints are retained for compatibility, but old clients can still lose a stream
at process exit. Subsequent protocol 1 releases are eligible for the proved handoff.

Watch recovery has a separate contract in `WATCH_JOBS.md`. Mixed-release Next
assets/RSC and browser state, immutable image publication and exact live volume/health configuration
are separate gates. Passing these job tests alone does not activate deployment.

## Verification

Client tests cover stable IDs, dropped committed replies, EOF replay, quota and IP
limits shared across SQLite connections, payload conflicts, account isolation,
lease renewal/fencing, expiry, durable storage failures and writable readiness.
Shared tests cover bounded cancellation of providers that ignore their signal.

The opt-in process test uses a temporary SQLite database, synthetic accounts and
random loopback ports. It runs the actual handler, worker, client stream consumer
and drain preload in separate Node processes. No real provider or email is used:

```sh
RUN_ROLLING_HTTP_PROOF=1 pnpm --filter @starter/client test src/tests/check-jobs-http.test.ts
```

It requires a 35-second check to complete after a 20-second graceful retirement,
then exercises forced process death, replay after a lost response, completed
provider reuse and logout from another SQLite connection. `ROLLING_PROOF_REPORT`
optionally writes a JSON summary. Every owned process/database is cleaned up.
