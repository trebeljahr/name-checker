import {
  notifyDone,
  notifyTabOpen,
  observeDom,
  observeUrl,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "tiktok" as const;

const isSignup = (): boolean =>
  location.pathname.startsWith("/signup");

const isConfirmed = (): boolean =>
  /^\/@/.test(location.pathname) || location.pathname === "/foryou" || location.pathname === "/";

const findUsernameInput = (): HTMLInputElement | null => {
  const candidates = document.querySelectorAll<HTMLInputElement>(
    "input[name=username], input[name=nickname], input[placeholder*='username' i], input[placeholder*='nickname' i]",
  );
  for (const el of candidates) if (el.offsetParent) return el;
  return null;
};

const prefill = async (query: string): Promise<boolean> => {
  const el = await waitFor(findUsernameInput, { timeoutMs: 60_000 });
  if (!el || !(el instanceof HTMLInputElement)) return false;
  if (el.value && el.value !== query) return false;
  setNativeInputValue(el, query);
  return true;
};

const main = async (): Promise<void> => {
  const query = await readPassportQuery();
  if (!query) return;

  notifyTabOpen(PLATFORM);

  let prefilled = false;
  const tryPrefill = async () => {
    if (prefilled || !isSignup()) return;
    prefilled = await prefill(query);
  };

  await tryPrefill();
  const offDom = observeDom(() => void tryPrefill());
  const offUrl = observeUrl(() => {
    if (isConfirmed()) {
      notifyDone(PLATFORM);
      offDom();
      offUrl();
    } else {
      void tryPrefill();
    }
  });
};

void main();
