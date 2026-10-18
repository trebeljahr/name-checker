# Scheduled watch recovery

All replicas must mount the same local SQLite directory, including its WAL and
SHM files. The additive `watch_runs` and `watch_run_results` tables retain cron
receipts, provider checkpoints, and notification state. They do not make a
single-host database highly available.

## First adoption

1. Pause the old cron trigger and retire every old server process that can run
   `/api/cron/watch`. The old implementation ignores leases and can overwrite
   summaries or send duplicate email. Do not overlap that writer with this one.
2. Back up and verify restoration of the complete shared database. Keep the
   existing user, session, watch, billing, and check-job tables intact.
3. Start the new release against the same volume. Confirm readiness, authorized
   cron behavior, and mail configuration before resuming the trigger.
4. Subsequent releases may overlap if they preserve this receipt protocol.
   Rolling back to the old cron implementation requires pausing cron and
   stopping all receipt workers first. Keep the additive tables; do not erase
   unresolved notification records to make a rollback appear clean.

## Ownership and recovery

Only authorized cron requests capture fresh due watches. Capture is one SQLite
statement with a unique active-receipt constraint per watch. Each request or
startup scan processes at most ten receipts within a 20-second budget. The
startup worker (`src/workers.ts`) resumes existing receipts only; it does not
schedule fresh checks and does not run in development or tests.

A worker renews its ten-second token lease every 250 ms. Every checkpoint and
summary transition checks the token and expiration inside an immediate SQLite
transaction. A monotonic deadline also stops a worker after a suspended event
loop. The watch baseline comparison prevents an older result from replacing a
changed summary. Completed provider results and the provider selection are
reused after interruption. A release missing a required provider holds that
receipt with `requires_newer_release` instead of silently changing its checks.
Bounded scans order by last progress so a held receipt does not starve later work.

A summary and its email intent commit in the same transaction. Deleting the
watch deletes its retained work through foreign keys. Before starting email,
the worker rechecks the current watch owner and recipient. This cannot retract
email already submitted to an external provider when a watch is deleted.

Drain stops admission immediately and aborts active checks and mail. Startup
recovery polls the drain flag every 100 ms and clears its timers. SMTP owns and
destroys the actual socket; SES aborts and destroys its client. Both have an
absolute ten-second delivery deadline. SES SDK retries are disabled.

## Notification uncertainty

`checking` may resume from provider checkpoints. `pending` contains a committed
email intent that has not been submitted, or a failure proven to happen before
submission (for example, invalid sender configuration). It can retry.

`beginDelivery` commits `sending` before external I/O. A successful response
records `sent` only while the original token remains valid. A transport error,
a drain during delivery, or expiration after a sender disappears records
`uncertain`. A successor never claims `sending` or `uncertain`; an old worker
cannot acknowledge or change the outcome after its lease expires. A crash in
the narrow gap before the external send may therefore produce a conservative
hold even when no email was delivered.

The scheduler response includes only receipt IDs, phases, generic reasons, and
`heldDeliveries`. It excludes query text, recipients, provider responses, and
email bodies. The database contains private watch content and must be handled
as user data. Check held rows through authorized database inspection, exposing
only metadata to routine operational output.

An operator must investigate an `uncertain` receipt against the mail provider's
delivery records. Preserve it if delivery cannot be established. Do not reset
it to `pending`, clear it on restart, or retry it based solely on an expired
lease. Any manually approved replacement notification is a distinct action
with possible duplicate delivery. SMTP and SES do not provide exactly-once
email delivery, and this implementation does not claim it.

`no_change`, `obsolete`, and `sent` are terminal receipts. Terminal receipts older than seven days are deleted in batches of at most 100
per scan, including their provider checkpoints. Unresolved checking, pending,
sending, and uncertain records are retained until explicitly resolved or their
watch is deleted; retention cleanup never discards unresolved mail intent. Later scheduled checks can report a new change while an older
notification remains uncertain.

## Local validation

`watch-jobs.test.ts` uses two independent WAL connections for duplicate cron
capture, fencing, checkpoint recovery, atomic intent, and late-sender refusal.
`watch-runtime.test.ts` tests startup-only replay and drain during delivery.
`mail-delivery.test.ts` uses synthetic localhost SMTP peers, including stalled
DATA and implicit TLS; it never sends external email. SES tests replace the SDK
with an in-memory fixture and verify abort and disabled retries. Route and
startup-worker tests (`watch-route.test.ts`, `workers.test.ts`) verify
authorization and the production-only start.
