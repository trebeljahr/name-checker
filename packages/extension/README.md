# @starter/extension

Browser extension companion for **name-check brand passport**. Automates tier-2 of
the passport flow — platforms where signup requires phone or CAPTCHA, so we can't
fully automate, but we can prefill the handle and bring the time-to-claim down
from ~1 hour to ~5 minutes.

Covered platforms (v1):

| Platform               | Action                                                        |
| ---------------------- | ------------------------------------------------------------- |
| X (Twitter)            | Prefill `username` in the signup flow                         |
| TikTok                 | Prefill `username` on `/signup/phone-or-email/email`          |
| Instagram              | Prefill `username` on `/accounts/emailsignup/`                |
| Reddit                 | Prefill `#regUsername` / `[name=username]` on `/register`     |
| Twitch                 | Prefill `username` in the signup modal                        |
| Threads                | Detect profile URL match (handle is inherited from IG)        |
| LinkedIn (company page)| Prefill `companyName` on `/setup/create-company-page/`        |

The extension never auto-submits. The user solves the CAPTCHA / phone challenge
and clicks submit themselves. When the destination page indicates success, the
extension marks the platform as `done` and posts to
`POST $NEXT_PUBLIC_PASSPORT_ORIGIN/api/passport/manual-confirm`.

## Build

```bash
pnpm --filter @starter/extension build       # production build → dist/
pnpm --filter @starter/extension dev         # watch mode (unminified)
```

Override the API origin baked into the bundle:

```bash
NEXT_PUBLIC_PASSPORT_ORIGIN=https://name-check.example.com \
  pnpm --filter @starter/extension build
```

Default: `http://localhost:3000`.

## Load unpacked (Chrome / Edge / Arc / Brave)

1. `pnpm --filter @starter/extension build`
2. Visit `chrome://extensions`.
3. Toggle **Developer mode** (top right).
4. **Load unpacked** → select `packages/extension/dist/`.
5. Pin the extension to the toolbar (puzzle icon → pin).

## Sync a passport into the extension

The name-check web app writes the passport into `window.localStorage.passport`
when you open `/passport/<query>`. To pull it into the extension:

- Open the popup → click **Sync from page**.
- Or: have the web app send a `chrome.runtime.sendMessage` to the extension ID
  using the `externally_connectable` channel (see `manifest.json`).

You can also set the passport directly in DevTools while the popup is open:

```js
chrome.storage.local.set({ passport: { query: "kairosxyz" } });
```

## Web Store publishing

Not done by this build script. Steps:

1. `pnpm --filter @starter/extension build`
2. `cd packages/extension && zip -r ../../name-check-extension.zip dist`
3. Upload to <https://chrome.google.com/webstore/devconsole>.
4. Fill in the listing, request the host permissions, submit for review.

Firefox (AMO) is a follow-up — MV3 is supported but the background `service_worker`
needs a small shim to `background.scripts`.

## Architecture

```
src/
  background.ts          service worker — owns storage + tab orchestration
  popup/                 React popup, shows passport + per-platform status
  content/               one content script per platform, plus shared utils
  lib/passport.ts        shared types + API client
scripts/build.ts         esbuild bundler (no Vite, no wxt)
manifest.json            MV3 manifest, copied into dist/ at build time
```

## Security / scope notes

- The extension does not bypass CAPTCHAs, solve phone challenges, or auto-submit
  forms. It only prefills fields the user can see.
- `host_permissions` are scoped to the 7 target platforms plus `localhost` so the
  popup can sync from a local dev web app.
- No code reads cookies, auth tokens, or anything outside the username field.
- The `manual-confirm` POST sends `{query, platform}` only. No tracking, no PII.

## Selectors drift

Signup forms change all the time. If a content script stops working, update its
selector and rebuild. Each script logs nothing in production; flip
`sharedOpts.minify` off in `scripts/build.ts` and use Chrome DevTools to inspect.
