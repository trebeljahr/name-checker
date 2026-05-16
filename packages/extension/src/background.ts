import {
  PLATFORMS,
  readPassport,
  reportConfirm,
  updateStatus,
  writePassport,
  type BgMessage,
  type BgResponse,
  type Passport,
  type PlatformId,
} from "./lib/passport.ts";

const OPEN_DELAY_MS = 2000;

const findPlatform = (id: PlatformId) => PLATFORMS.find((p) => p.id === id);

const openSignupTab = async (id: PlatformId): Promise<void> => {
  const def = findPlatform(id);
  if (!def) return;
  await chrome.tabs.create({ url: def.signupUrl, active: true });
  await updateStatus(id, "tab_open");
};

const openAll = async (): Promise<void> => {
  for (const def of PLATFORMS) {
    await chrome.tabs.create({ url: def.signupUrl, active: false });
    await updateStatus(def.id, "tab_open");
    await new Promise((r) => setTimeout(r, OPEN_DELAY_MS));
  }
};

const handleMessage = async (msg: BgMessage): Promise<BgResponse> => {
  switch (msg.type) {
    case "get_passport": {
      const passport = await readPassport();
      return { ok: true, passport };
    }
    case "set_passport": {
      await writePassport(msg.passport);
      return { ok: true };
    }
    case "open_signup": {
      await openSignupTab(msg.platform);
      return { ok: true };
    }
    case "open_all": {
      await openAll();
      return { ok: true };
    }
    case "platform_tab_open": {
      await updateStatus(msg.platform, "tab_open");
      return { ok: true };
    }
    case "platform_done": {
      const updated = await updateStatus(msg.platform, "done");
      if (updated) await reportConfirm(updated.query, msg.platform);
      return { ok: true };
    }
    default: {
      return { ok: false, error: "unknown_message" };
    }
  }
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg as BgMessage)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error } satisfies BgResponse);
    });
  return true;
});

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  const externalMsg = msg as { type?: string; passport?: Passport };
  if (externalMsg.type === "set_passport" && externalMsg.passport) {
    writePassport(externalMsg.passport)
      .then(() => sendResponse({ ok: true } satisfies BgResponse))
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error } satisfies BgResponse);
      });
    return true;
  }
  sendResponse({ ok: false, error: "unknown_external_message" } satisfies BgResponse);
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[name-check] extension installed");
});
