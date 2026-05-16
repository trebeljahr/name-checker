import {
  notifyDone,
  notifyTabOpen,
  observeDom,
  observeUrl,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "x" as const;

const findUsernameInput = (): HTMLInputElement | null => {
  const byName = document.querySelector<HTMLInputElement>("input[name=username]");
  if (byName) return byName;
  const inputs = document.querySelectorAll<HTMLInputElement>("input[autocomplete=username]");
  for (const el of inputs) if (el.offsetParent) return el;
  return null;
};

const prefill = async (query: string): Promise<boolean> => {
  const el = await waitFor(findUsernameInput, { timeoutMs: 60_000 });
  if (!el || !(el instanceof HTMLInputElement)) return false;
  if (el.value && el.value !== query) return false;
  setNativeInputValue(el, query);
  return true;
};

const isOnSignupFlow = (): boolean =>
  /^https:\/\/(?:x|twitter)\.com\/i\/flow\/signup/.test(location.href);

const isConfirmed = (): boolean => {
  if (!/^https:\/\/(?:x|twitter)\.com\//.test(location.href)) return false;
  return /\/home(?:$|[?#/])/.test(location.pathname);
};

const main = async (): Promise<void> => {
  const query = await readPassportQuery();
  if (!query) return;

  notifyTabOpen(PLATFORM);

  let prefilled = false;
  const tryPrefill = async () => {
    if (prefilled) return;
    if (!isOnSignupFlow()) return;
    prefilled = await prefill(query);
  };

  await tryPrefill();
  const offDom = observeDom(() => {
    void tryPrefill();
  });
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
