# Deploying names.trebeljahr.com

A push to `main` builds and deploys production. Nothing else does.

## What runs in production

One hostname, two halves:

| Path on names.trebeljahr.com | Served by |
| --- | --- |
| `/api/*` | The API server (`packages/server`), Coolify project `name-checker`, image `ghcr.io/trebeljahr/name-checker-server` |
| `/.well-known/acme-challenge/*` | Traefik on Coolify (it holds the origin certificate) |
| everything else | The Cloudflare Worker `name-checker-client`: the static export of `packages/client` |

Cloudflare decides by Workers routes on the `trebeljahr.com` zone: `/api/*`
and the ACME path are routes with no Worker, so they go to the origin; `/*`
is the Worker. No Worker code runs: requests to static assets and to routes
with no Worker do not count toward the Workers Free request cap.

The API server mounts the named volume `auth-data` at `/app/data`. It holds
`auth.db`: accounts, sessions, subscriptions, usage, watches, check jobs and
billing records. It is production state. On the host the volume is
`bwmqy47daye8znhfspycftmi_auth-data` (the Compose app's uuid).

Until `hatchkit migrate-runtime` moves it (below), the server runs on the
Docker Compose app `bwmqy47daye8znhfspycftmi` from `docker-compose.yml`. Its
service is still called `client`: Coolify keys the app's domain and its
`SERVICE_*` variables on the service name, so renaming it would drop the
route. A Compose deploy stops the old container before it starts the new
one; the image's 20 s SIGTERM drain (`SHUTDOWN_DRAIN_SECONDS`) only delays
that stop there, as it did for the Next image. It is kept because the Image
app after `migrate-runtime` needs it, and that move copies this service's
environment.

## What a push runs

`.github/workflows/build-and-deploy.yml`, in order:

1. `verify`: install, build every package, typecheck, unit tests.
2. `e2e`: Playwright against the static export, served the way the Worker
   serves it (`packages/client/scripts/serve-export.mjs`), with the API
   server behind `/api`.
3. `build-server`: builds `packages/server/Dockerfile`, pushes
   `ghcr.io/trebeljahr/name-checker-server` as `:main` and `:<commit sha>`.
4. `build-client`: `next build` (static export), carries the hashed chunks
   of the last two releases into `out/` (`scripts/carry-static.mjs`, copied
   from hatchkit), checks
   the export, and uploads it as a new Worker version with
   `wrangler versions upload`. Nothing is live yet.
5. `deploy`:
   - refuses to run while `/` still answers `x-powered-by: Next.js` (the
     Next container still serves the pages; the server image has none);
   - sends Coolify a signed `push` payload for the app
     `COOLIFY_RESOURCE_UUID` names;
   - waits until `/api/health` reports this commit as `version`;
   - activates the uploaded Worker version (`wrangler versions deploy`);
   - waits until `/version.json` reports this commit.

Server first, client second: the client switch takes seconds and only
happens once the new server answers. A failure after the server step leaves
the new server with the previous client, which is the compatible direction.

Secrets: `COOLIFY_BASE_URL`, `COOLIFY_RESOURCE_UUID`, `COOLIFY_DEPLOY_SECRET`,
`COOLIFY_DEPLOY_REPOSITORY`, `COOLIFY_DEPLOY_BRANCH` (hatchkit writes them),
and `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, a token limited to this
one Worker. Repository variables: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`,
`NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`; without them the pages carry no
analytics script.

`packages/client/.env.production` is the dotenvx-encrypted store hatchkit
reads and writes; it holds the server's settings. Next loads it during the
client build, so `next.config.ts` drops any `NEXT_PUBLIC_*` value from it
that is still ciphertext, and `check-export.mjs` fails the build if
ciphertext reaches `out/`.

## Checking a release

| Check | Expected |
| --- | --- |
| `https://names.trebeljahr.com/version.json` | `{"commit":"<full sha of the pushed commit>"}` |
| Homepage `<meta name="build-commit">` | the same sha |
| `https://names.trebeljahr.com/api/health` | 200, `{"status":"ok","checksProtocol":1,"databaseId":"f3755ef7-…","version":"<sha>"}` |
| `curl -sI https://names.trebeljahr.com/` | no `x-powered-by` header (the Worker serves it) |
| Coolify, app page, Deployments | newest entry: trigger Webhook, that commit, Success |

`/api/health` takes a write lock on the SQLite file, so it fails when the
account database is missing or read-only, not only when the process is down.
With `AUTH_DB_EXPECTED_ID` set (it is, in production) a container that opened
any other database file answers 503 with `"reason":"database identity mismatch"`.

## Rolling back

- Pages: `npx wrangler@4.145.0 versions list --name name-checker-client`,
  then `npx wrangler@4.145.0 versions deploy <version id>@100% --name name-checker-client`.
  A version keeps its own files, so this is complete and takes seconds.
- API server: in Coolify set the app's `SERVER_IMAGE` variable to
  `ghcr.io/trebeljahr/name-checker-server:<older sha>` and redeploy, or
  revert the commit and push. Remove `SERVER_IMAGE` again before the next
  push. Every schema change so far adds tables and alters none, so an older
  image reads a newer database.
- The whole split: there is no image left that serves pages from Coolify.
  The last Next image, `ghcr.io/trebeljahr/name-checker-client`, was deleted
  on 2026-10-18 (GitHub can restore a deleted package for 30 days, until
  2026-11-17). Roll the Worker back to an earlier version instead.

## Moving the server to a Docker Image app (rolling deploys)

A Compose deploy stops the running container before it starts the new one:
`/api/*` is down for about 10 s plus the time the old container takes to
exit. A Docker Image app starts the new container, waits for its health
check, then stops the old one. The image is ready for that: `/api/health`,
`curl` for Coolify's probe, the SIGTERM drain (`drain.cjs`), and jobs that
resume in the next container (`packages/server/src/lib/CHECK_JOBS.md`,
`WATCH_JOBS.md`).

The move is Rico's run of `hatchkit migrate-runtime` with the volume carried
by name (nothing is copied):

```
hatchkit migrate-runtime --carry-volume client=auth-data \
  --health-path client=/api/health --same-json client=/api/health:databaseId
```

Take and verify a backup first (`pnpm backup:status`, `pnpm backup:list`).
During verification two containers write one SQLite file in WAL mode on the
same host, which the job leases are built for. Keep the Compose app stopped,
not deleted, until the new app has served for a while. Afterwards hatchkit
points the five `COOLIFY_*` secrets at the new app; the workflow does not
change.

## Scheduled watch checks

`GET /api/cron/watch` with `Authorization: Bearer $CRON_SECRET` runs the due
watch checks and sends their emails. Nothing calls it today: `CRON_SECRET` is
empty in production and Coolify has no scheduled task, so it answers 503.
(`vercel.json` scheduled it daily at 13:00 UTC while the app was on Vercel.)
Turning it on is a product decision, because the first run emails every
watcher whose result changed. To turn it on: set `CRON_SECRET`, then add a
Coolify scheduled task on the server app, `0 13 * * *`, command
`curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:6657/api/cron/watch`.
Read `packages/server/src/lib/WATCH_JOBS.md` first.
