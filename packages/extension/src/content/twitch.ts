import {
  notifyDone,
  notifyTabOpen,
  observeDom,
  observeUrl,
  readPassportQuery,
  setNativeInputValue,
  waitFor,
} from "./shared.ts";

const PLATFORM = "twitch" as const;

const isSignupVisible = (): boolean =>
  !!document.querySelector("[data-a-target=passport-modal], [data-a-target=signup-username-input]");

const isConfirmed = (): boolean =>
  !!document.querySelector("[data-a-target=user-menu-toggle], [data-test-selector=user-menu__toggle]");

const findUsernameInput = (): HTMLInputElement | null => {
  const byAttr = document.querySelector<HTMLInputElement>(
    "[data-a-target=signup-username-input] input, input[autocomplete=username]",
  );
  if (byAttr) return byAttr;
  const candidates = document.querySelectorAll<HTMLInputElement>("input[name=username]");
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
  let confirmed = false;
  const teardown: Array<() => void> = [];

  const tryPrefill = async () => {
    if (prefilled || !isSignupVisible()) return;
    prefilled = await prefill(query);
  };

  const checkConfirm = () => {
    if (confirmed) return;
    if (prefilled && isConfirmed()) {
      confirmed = true;
      notifyDone(PLATFORM);
      for (const fn of teardown) fn();
    }
  };

  await tryPrefill();
  teardown.push(
    observeDom(() => {
      void tryPrefill();
      checkConfirm();
    }),
  );
  teardown.push(observeUrl(() => void tryPrefill()));
};

void main();
