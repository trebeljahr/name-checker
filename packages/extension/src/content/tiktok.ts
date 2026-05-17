import {
  bootstrapSignupWatcher,
  findVisibleInput,
  notifyDone,
  notifyTabOpen,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "tiktok" as const;

const isSignup = (): boolean =>
  location.pathname.startsWith("/signup");

const isConfirmedUrl = (): boolean =>
  /^\/@/.test(location.pathname) || location.pathname === "/foryou" || location.pathname === "/";

const findUsernameInput = (): HTMLInputElement | null =>
  findVisibleInput([
    "input[name=username], input[name=nickname], input[placeholder*='username' i], input[placeholder*='nickname' i]",
  ]);

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
  const tryPrefill = async (): Promise<void> => {
    if (prefilled || !isSignup()) return;
    prefilled = await prefill(query);
  };

  await bootstrapSignupWatcher({
    tryPrefill,
    isConfirmed: isConfirmedUrl,
    onConfirmed: () => notifyDone(PLATFORM),
  });
};

void main();
