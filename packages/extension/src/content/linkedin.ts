import {
  notifyDone,
  notifyTabOpen,
  observeDom,
  observeUrl,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "linkedin" as const;

const isSetup = (): boolean =>
  location.pathname.startsWith("/setup/create-company-page") ||
  location.pathname.startsWith("/company/setup/new");

const isConfirmed = (): boolean =>
  /^\/company\/[^/]+\/?(admin|$)/.test(location.pathname);

const findNameInput = (): HTMLInputElement | null => {
  const byName = document.querySelector<HTMLInputElement>("input[name=companyName], input[id*=company-name i], input[aria-label*='Name' i]");
  if (byName && byName.offsetParent) return byName;
  return null;
};

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
  const tryPrefill = async () => {
    if (prefilled || !isSetup()) return;
    prefilled = await prefill(query);
  };

  await tryPrefill();
  const offDom = observeDom(() => void tryPrefill());
  const offUrl = observeUrl(() => {
    if (isConfirmed() && prefilled) {
      notifyDone(PLATFORM);
      offDom();
      offUrl();
    } else {
      void tryPrefill();
    }
  });
};

void main();
