const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 20;

function key(query: string): string {
  return `passport:bluesky-password:${query}`;
}

export function readBlueskyPassword(storage: Storage, query: string): string | null {
  try {
    return storage.getItem(key(query));
  } catch {
    return null;
  }
}

// The password must survive a lost response after Bluesky creates the account, so it
// is saved in this tab before the request. A retry reuses it. Storage failure throws
// and the caller must not submit.
export function prepareBlueskyPassword(storage: Storage, query: string, random: Crypto = crypto): string {
  const existing = storage.getItem(key(query));
  if (existing) return existing;
  const bytes = random.getRandomValues(new Uint8Array(LENGTH));
  const password = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  storage.setItem(key(query), password);
  if (storage.getItem(key(query)) !== password) throw new Error("password storage failed");
  return password;
}

export function forgetBlueskyPassword(storage: Storage, query: string): void {
  try {
    storage.removeItem(key(query));
  } catch {
    // Nothing else to do: the tab closes the storage with it.
  }
}
