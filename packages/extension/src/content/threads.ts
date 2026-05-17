import {
  notifyDone,
  notifyTabOpen,
  observeUrl,
  readPassportQuery,
} from "./shared.ts";

const PLATFORM = "threads" as const;

const isProfile = (query: string): boolean => {
  const path = decodeURIComponent(location.pathname);
  return path.startsWith(`/@${query}`) || path === `/@${query}/`;
};

const main = async (): Promise<void> => {
  const query = await readPassportQuery();
  if (!query) return;

  notifyTabOpen(PLATFORM);

  if (isProfile(query)) {
    notifyDone(PLATFORM);
    return;
  }

  const off = observeUrl(() => {
    if (isProfile(query)) {
      notifyDone(PLATFORM);
      off();
    }
  });
};

void main();
