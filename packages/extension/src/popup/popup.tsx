import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  PLATFORMS,
  type Passport,
  type PlatformDef,
  type PlatformStatus,
  type BgMessage,
  type BgResponse,
} from "../lib/passport.ts";

const sendMessage = async <T extends BgResponse = BgResponse>(
  msg: BgMessage,
): Promise<T> => {
  return new Promise<T>((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: T) => resolve(resp));
  });
};

const readFromActiveTabLocalStorage = async (): Promise<Passport | null> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          const raw = window.localStorage.getItem("passport");
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
    });
    return (result?.result as Passport | null) ?? null;
  } catch {
    return null;
  }
};

const StatusDot: React.FC<{ status: PlatformStatus }> = ({ status }) => (
  <span className={`dot ${status}`} aria-hidden="true" />
);

const Row: React.FC<{
  def: PlatformDef;
  status: PlatformStatus;
  onOpen: () => void;
  disabled: boolean;
}> = ({ def, status, onOpen, disabled }) => (
  <li className="row">
    <span className="row-label">
      <StatusDot status={status} />
      <span>{def.label}</span>
    </span>
    <button
      type="button"
      className="open-btn"
      onClick={onOpen}
      disabled={disabled}
    >
      {status === "done" ? "Reopen" : "Open"}
    </button>
  </li>
);

const App: React.FC = () => {
  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingAll, setOpeningAll] = useState(false);

  const refresh = useCallback(async () => {
    const resp = await sendMessage({ type: "get_passport" });
    if (resp.ok && "passport" in resp) {
      setPassport(resp.passport);
    }
    setLoading(false);
  }, []);

  const syncFromActiveTab = useCallback(async () => {
    const fromTab = await readFromActiveTabLocalStorage();
    if (fromTab?.query) {
      await sendMessage({ type: "set_passport", passport: fromTab });
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ("passport" in changes) {
        const next = changes.passport?.newValue as Passport | undefined;
        if (next) setPassport(next);
      }
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, [refresh]);

  const onOpen = useCallback(async (id: PlatformDef["id"]) => {
    await sendMessage({ type: "open_signup", platform: id });
  }, []);

  const onOpenAll = useCallback(async () => {
    setOpeningAll(true);
    await sendMessage({ type: "open_all" });
    setOpeningAll(false);
  }, []);

  const hasPassport = passport && passport.query;

  return (
    <>
      <div className="header">
        <span className="title">brand passport</span>
        <span className="brand">name-check</span>
      </div>
      {loading ? (
        <div className="query empty">loading…</div>
      ) : hasPassport ? (
        <code className="query">{passport.query}</code>
      ) : (
        <div className="query empty">
          no passport set — open a /passport/&lt;name&gt; page or sync below
        </div>
      )}
      <ul className="list">
        {PLATFORMS.map((p) => {
          const status: PlatformStatus =
            passport?.status?.[p.id] ?? "not_started";
          return (
            <Row
              key={p.id}
              def={p}
              status={status}
              onOpen={() => onOpen(p.id)}
              disabled={!hasPassport}
            />
          );
        })}
      </ul>
      <div className="cta">
        <button
          type="button"
          onClick={onOpenAll}
          disabled={!hasPassport || openingAll}
        >
          {openingAll ? "opening…" : "Open all signups"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={syncFromActiveTab}
        >
          Sync from page
        </button>
      </div>
      <div className="footer">
        you handle CAPTCHAs + submit; we mark done on confirmation
      </div>
    </>
  );
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
