import {
  bootstrapSignupWatcher,
  findVisibleInput,
  notifyDone,
  notifyTabOpen,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "twitch" as const;

const isSignupVisible = (): boolean =>
  !!document.querySelector("[data-a-target=passport-modal], [data-a-target=signup-username-input]");

const isConfirmedDom = (): boolean =>
  !!document.querySelector("[data-a-target=user-menu-toggle], [data-test-selector=user-menu__toggle]");

const findUsernameInput = (): HTMLInputElement | null =>
  findVisibleInput([
    "[data-a-target=signup-username-input] input, input[autocomplete=username]",
    "input[name=username]",
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
    if (prefilled || !isSignupVisible()) return;
    prefilled = await prefill(query);
  };

  await bootstrapSignupWatcher({
    tryPrefill,
    isConfirmed: () => prefilled && isConfirmedDom(),
    onConfirmed: () => notifyDone(PLATFORM),
  });
};

void main();
