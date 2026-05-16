import {
  notifyDone,
  notifyTabOpen,
  observeDom,
  observeUrl,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "reddit" as const;

const isSignup = (): boolean =>
  location.pathname.startsWith("/register") || location.pathname.startsWith("/account/register");

const isConfirmed = (): boolean =>
  location.pathname === "/" && !!document.querySelector("[data-testid=user-drawer-button], [data-testid=user-avatar]");

const findUsernameInput = (): HTMLInputElement | null => {
  const byId = document.querySelector<HTMLInputElement>("#regUsername");
  if (byId && byId.offsetParent) return byId;
  const candidates = document.querySelectorAll<HTMLInputElement>(
    "input[name=username]",
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
