const CONFUSABLES: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "а": "a",
  "е": "e",
  "о": "o",
  "р": "p",
  "с": "c",
  "у": "y",
  "х": "x",
  "і": "i",
  "ј": "j",
  "ѕ": "s",
  "ӏ": "l",
  "А": "a",
  "Е": "e",
  "О": "o",
  "Р": "p",
  "С": "c",
  "У": "y",
  "Х": "x",
  "α": "a",
  "ο": "o",
  "ρ": "p",
  "τ": "t",
  "ν": "v",
  "μ": "u",
  "Α": "a",
  "Ο": "o",
  "ı": "i",
  "ł": "l",
  "ð": "d",
};

export function normalizeHomoglyphs(s: string): string {
  if (!s) return "";
  const decomposed = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of decomposed) {
    const direct = CONFUSABLES[ch];
    if (direct !== undefined) {
      out += direct;
      continue;
    }
    const lower = ch.toLowerCase();
    const mapped = CONFUSABLES[lower];
    out += mapped !== undefined ? mapped : lower;
  }
  return out;
}
