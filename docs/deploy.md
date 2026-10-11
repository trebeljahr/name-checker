# Deploying names.trebeljahr.com

A push to `main` builds and deploys production. Nothing else does.

## What a push runs

`.github/workflows/build-and-deploy.yml`, in order:

1. `verify`: install, build every package, unit tests.
2. `e2e`: Playwright against a dev server.
3. `build-client`: builds `packages/client/Dockerfile` and pushes
   `ghcr.io/trebeljahr/name-checker-client` as `:main` and `:<commit sha>`.
   The commit is passed as the `BUILD_COMMIT` build argument. The Plausible
   tag is built in from the repository variables
   `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`;
   without them the pages carry no analytics script.
4. `deploy`: sends Coolify a signed `push` payload for the one app that
   `COOLIFY_RESOURCE_UUID` names. The payload lists `.hatchkit/deploy-webhook`
   as the changed file, which is that app's only watch path, so Coolify
   deploys for this step and for nothing else.

The step needs the repository secrets `COOLIFY_BASE_URL`,
`COOLIFY_RESOURCE_UUID`, `COOLIFY_DEPLOY_SECRET`, `COOLIFY_DEPLOY_REPOSITORY`
and `COOLIFY_DEPLOY_BRANCH`. Hatchkit writes all five (`hatchkit sync`,
`hatchkit secrets isolate`). There is no gate variable: if the secrets are
set, a green build deploys.

## Checking a release

| Check | Expected |
| --- | --- |
| `https://names.trebeljahr.com/version.json` | `{"commit":"<full sha of the pushed commit>"}` |
| Homepage `<meta name="build-commit">` | the same sha |
| `https://names.trebeljahr.com/api/health` | 200, `{"status":"ok","checksProtocol":1,"databaseId":"…"}` |
| Coolify, app page, Deployments | newest entry: trigger Webhook, that commit, Success |

`/api/health` takes a write lock on the SQLite file, so it fails when the
account database is missing or read-only, not only when the process is down.

## What runs in production

Coolify project `name-checker`, one Docker Compose app built from
`docker-compose.yml`. It pulls the `:main` image (`pull_policy: always`) and
mounts the named volume `auth-data` at `/app/data`. That volume holds
`auth.db`: accounts, sessions, subscriptions, usage, watches, check jobs and
billing records. It is production state. On the host the volume is named
`<compose app uuid>_auth-data`.

A Compose deploy removes the running container and then starts the new one.
The site is down in between: 10 s in the deployment of 2026-10-01, plus the
time the stopping container takes to exit. The image waits
`SHUTDOWN_DRAIN_SECONDS` (20) on SIGTERM, which helps a rolling deploy and
only delays a Compose one.

## Rolling back

Redeploy an older image: in Coolify set the app's `CLIENT_IMAGE` variable to
`ghcr.io/trebeljahr/name-checker-client:<older sha>` and redeploy, or revert
the commit and push. Every schema change so far adds tables and alters none, so an older image
reads a newer database. Remove `CLIENT_IMAGE` again before the next push,
otherwise the push builds an image the app does not pull.

## Moving to a Docker Image app (rolling deploys)

Coolify replaces a Docker Image app by starting the new container, waiting
for its health check, then stopping the old one. The image is ready for
that: `/api/health`, `curl` for Coolify's probe, the SIGTERM drain, and jobs
that resume in the next container (`src/lib/CHECK_JOBS.md`,
`src/lib/WATCH_JOBS.md`).

The move itself is not done. `hatchkit migrate-runtime` (0.2.18) refuses a
Compose service that mounts a volume, because a new app would start on an
empty one. Whoever does the move, by tool or by hand, has to make the new
app mount the existing volume before its first deploy.

The guard for that step is `AUTH_DB_EXPECTED_ID`:

1. Read `databaseId` from production's `/api/health`.
2. Set `AUTH_DB_EXPECTED_ID` to it on the Compose app in Coolify and deploy.
   The copy of the environment that the new app receives then carries it.
3. A container that opened any other database file answers 503 with
   `"reason":"database identity mismatch"`. Its health check never passes,
   so Coolify does not route to it and the Compose app keeps serving.
4. Before traffic moves, the new app's `/api/health` must report the same
   `databaseId` as production.

During the overlap two containers write one SQLite file in WAL mode. Take a
backup first (`pnpm backup:status`, `pnpm backup:list`) and keep the Compose
app stopped, not deleted, until the new app has served for a while.

After the move hatchkit points the five secrets at the new app. The workflow
does not change: the same push then produces a rolling deploy.
