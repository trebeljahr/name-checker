import {
  bootstrapSignupWatcher,
  findVisibleInput,
  notifyDone,
  notifyTabOpen,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "instagram" as const;

const isSignup = (): boolean =>
  location.pathname.startsWith("/accounts/emailsignup");

const isConfirmedUrl = (): boolean =>
  location.pathname === "/" || /^\/[^/]+\/?$/.test(location.pathname);

const findUsernameInput = (): HTMLInputElement | null =>
  findVisibleInput(["input[name=username]"]);

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
    isConfirmed: () => prefilled && isConfirmedUrl(),
    onConfirmed: () => notifyDone(PLATFORM),
  });
};

void main();
