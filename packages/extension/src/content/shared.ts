import type { PlatformId } from "../lib/passport.ts";

type Pred = () => Element | null;

export const waitFor = (
  pred: Pred,
  { timeoutMs = 30_000, intervalMs = 250 } = {},
): Promise<Element | null> =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = pred();
      if (el) return resolve(el);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });

export const setNativeInputValue = (input: HTMLInputElement, value: string): void => {
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

export const readPassportQuery = async (): Promise<string | null> => {
  const got = await chrome.storage.local.get("passport");
  const p = got.passport as { query?: string } | undefined;
  return p?.query ?? null;
};

export const notifyTabOpen = (platform: PlatformId): void => {
  chrome.runtime.sendMessage({ type: "platform_tab_open", platform });
};

export const notifyDone = (platform: PlatformId): void => {
  chrome.runtime.sendMessage({ type: "platform_done", platform });
};

export const observeUrl = (onChange: (url: string) => void): (() => void) => {
  let last = location.href;
  const send = () => {
    if (location.href !== last) {
      last = location.href;
      onChange(last);
    }
  };
  const interval = window.setInterval(send, 500);
  window.addEventListener("popstate", send);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("popstate", send);
  };
};

export const observeDom = (onMutation: () => void): (() => void) => {
  const obs = new MutationObserver(() => onMutation());
  obs.observe(document.documentElement, { subtree: true, childList: true });
  return () => obs.disconnect();
};
