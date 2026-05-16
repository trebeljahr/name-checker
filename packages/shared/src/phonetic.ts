const VOWELS = "AEIOU";

function isVowel(c: string): boolean {
  return c.length === 1 && VOWELS.includes(c);
}

export function metaphone(input: string): string {
  if (!input) return "";
  const s = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  let word = s;
  for (const pair of ["KN", "GN", "PN", "AE", "WR"]) {
    if (word.startsWith(pair)) {
      word = word.slice(1);
      break;
    }
  }
  if (word.startsWith("X")) {
    word = "S" + word.slice(1);
  }

  const len = word.length;
  const at = (idx: number): string => (idx >= 0 && idx < len ? word[idx] : "");
  const isV = (idx: number): boolean => isVowel(at(idx));

  let out = "";
  let i = 0;

  if (isVowel(word[0])) {
    out += word[0];
    i = 1;
  }

  while (i < len) {
    const c = word[i];
    const prev = at(i - 1);
    const next = at(i + 1);
    const next2 = at(i + 2);

    if (c !== "C" && c === prev) {
      i++;
      continue;
    }

    switch (c) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
        break;
      case "B":
        if (!(i === len - 1 && prev === "M")) out += "B";
        break;
      case "C":
        if (next === "I" && next2 === "A") {
          out += "X";
        } else if (next === "H") {
          out += prev === "S" ? "K" : "X";
        } else if (next === "I" || next === "E" || next === "Y") {
          out += "S";
        } else {
          out += "K";
        }
        break;
      case "D":
        if (next === "G" && (next2 === "E" || next2 === "I" || next2 === "Y")) {
          out += "J";
          i++;
        } else {
          out += "T";
        }
        break;
      case "F":
        out += "F";
        break;
      case "G":
        if (next === "H") {
          if (i + 2 < len && isV(i + 2)) {
            if (i === 0) out += "K";
          }
        } else if (next === "N") {
          const atEnd = i + 2 >= len;
          const gnedAtEnd =
            next2 === "E" && at(i + 3) === "D" && i + 4 >= len;
          if (!atEnd && !gnedAtEnd) out += "K";
        } else if (next === "E" || next === "I" || next === "Y") {
          out += "J";
        } else {
          out += "K";
        }
        break;
      case "H":
        if (isVowel(prev) && !isV(i + 1)) {
          // silent
        } else if (i === 0 || isVowel(prev)) {
          if (isV(i + 1)) out += "H";
        }
        break;
      case "J":
        out += "J";
        break;
      case "K":
        if (prev !== "C") out += "K";
        break;
      case "L":
        out += "L";
        break;
      case "M":
        out += "M";
        break;
      case "N":
        out += "N";
        break;
      case "P":
        out += next === "H" ? "F" : "P";
        break;
      case "Q":
        out += "K";
        break;
      case "R":
        out += "R";
        break;
      case "S":
        if (next === "H") {
          out += "X";
          i++;
        } else if (next === "I" && (next2 === "O" || next2 === "A")) {
          out += "X";
        } else {
          out += "S";
        }
        break;
      case "T":
        if (next === "H") {
          out += "0";
          i++;
        } else if (next === "I" && (next2 === "O" || next2 === "A")) {
          out += "X";
        } else if (!(next === "C" && next2 === "H")) {
          out += "T";
        }
        break;
      case "V":
        out += "F";
        break;
      case "W":
        if (isV(i + 1)) out += "W";
        break;
      case "X":
        out += "KS";
        break;
      case "Y":
        if (isV(i + 1)) out += "Y";
        break;
      case "Z":
        out += "S";
        break;
    }
    i++;
  }

  return out;
}
