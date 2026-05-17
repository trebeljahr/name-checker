import {
  bootstrapSignupWatcher,
  findVisibleInput,
  notifyDone,
  notifyTabOpen,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "linkedin" as const;

const isSetup = (): boolean =>
  location.pathname.startsWith("/setup/create-company-page") ||
  location.pathname.startsWith("/company/setup/new");

const isConfirmedUrl = (): boolean =>
  /^\/company\/[^/]+\/?(admin|$)/.test(location.pathname);

const findNameInput = (): HTMLInputElement | null =>
  findVisibleInput([
    "input[name=companyName], input[id*=company-name i], input[aria-label*='Name' i]",
  ]);

const prefill = async (query: string): Promise<boolean> => {
  const el = await waitFor(findNameInput, { timeoutMs: 60_000 });
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
    if (prefilled || !isSetup()) return;
    prefilled = await prefill(query);
  };

  await bootstrapSignupWatcher({
    tryPrefill,
    isConfirmed: () => prefilled && isConfirmedUrl(),
    onConfirmed: () => notifyDone(PLATFORM),
  });
};

void main();
