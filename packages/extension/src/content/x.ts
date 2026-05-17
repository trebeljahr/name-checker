import {
  bootstrapSignupWatcher,
  findVisibleInput,
  notifyDone,
  notifyTabOpen,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "x" as const;

const isOnSignupFlow = (): boolean =>
  /^https:\/\/(?:x|twitter)\.com\/i\/flow\/signup/.test(location.href);

const isConfirmedUrl = (): boolean => {
  if (!/^https:\/\/(?:x|twitter)\.com\//.test(location.href)) return false;
  return /\/home(?:$|[?#/])/.test(location.pathname);
};

const findUsernameInput = (): HTMLInputElement | null =>
  findVisibleInput(["input[name=username]", "input[autocomplete=username]"]);

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
    if (prefilled || !isOnSignupFlow()) return;
    prefilled = await prefill(query);
  };

  await bootstrapSignupWatcher({
    tryPrefill,
    isConfirmed: isConfirmedUrl,
    onConfirmed: () => notifyDone(PLATFORM),
  });
};

void main();
