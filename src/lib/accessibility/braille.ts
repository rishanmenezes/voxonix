/**
 * Unicode 6-Dot Grade-1 Braille Translator for Accessible Deafblind Communication.
 *
 * TACTILE LIMITATION DISCLOSURE:
 * Standard electronic displays (laptop, phone, monitor) cannot provide tactile physical feedback.
 * This module generates standard Unicode Braille characters (U+2800 to U+28FF) designed for:
 * 1. Refreshable Braille displays connected via USB or Bluetooth.
 * 2. Screen readers configured for 6-dot / 8-dot Braille output.
 * 3. High-contrast visual reference for sighted companions or educators.
 */

// Grade 1 English 6-Dot Braille Alphabet Map
const BRAILLE_LETTERS: Record<string, string> = {
  a: "⠁",
  b: "⠃",
  c: "⠉",
  d: "⠙",
  e: "⠑",
  f: "⠋",
  g: "⠛",
  h: "⠓",
  i: "⠊",
  j: "⠚",
  k: "⠅",
  l: "⠇",
  m: "⠍",
  n: "⠝",
  o: "⠕",
  p: "⠏",
  q: "⠟",
  r: "⠗",
  s: "⠎",
  t: "⠞",
  u: "⠥",
  v: "⠧",
  w: "⠺",
  x: "⠭",
  y: "⠽",
  z: "⠵",
};

// Digits in Braille use letters a-j preceded by number prefix ⠼ (dots 3-4-5-6)
const BRAILLE_DIGITS: Record<string, string> = {
  "1": "⠁",
  "2": "⠃",
  "3": "⠉",
  "4": "⠙",
  "5": "⠑",
  "6": "⠋",
  "7": "⠛",
  "8": "⠓",
  "9": "⠊",
  "0": "⠚",
};

const BRAILLE_NUMBER_PREFIX = "⠼";
const BRAILLE_CAPITAL_PREFIX = "⠠";

const BRAILLE_PUNCTUATION: Record<string, string> = {
  " ": "⠀", // Unicode Braille Blank U+2800
  ",": "⠂",
  ";": "⠆",
  ":": "⠒",
  ".": "⠲",
  "!": "⠖",
  "?": "⠦",
  "'": "⠄",
  "-": "⠤",
  "(": "⠶",
  ")": "⠶",
  "/": "⠸",
};

/**
 * Translates standard plain text into 6-dot Grade 1 Unicode Braille representation.
 */
export function textToBraille(text: string): string {
  if (!text) return "";

  let result = "";
  let inNumberMode = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lower = char.toLowerCase();

    // Digits
    if (char >= "0" && char <= "9") {
      if (!inNumberMode) {
        result += BRAILLE_NUMBER_PREFIX;
        inNumberMode = true;
      }
      result += BRAILLE_DIGITS[char] || char;
      continue;
    }

    // Leaving number mode
    if (inNumberMode) {
      inNumberMode = false;
    }

    // Capital letter prefix
    if (char >= "A" && char <= "Z") {
      result += BRAILLE_CAPITAL_PREFIX;
      result += BRAILLE_LETTERS[lower] || lower;
      continue;
    }

    // Lowercase letter
    if (char >= "a" && char <= "z") {
      result += BRAILLE_LETTERS[char] || char;
      continue;
    }

    // Punctuation & spaces
    if (char in BRAILLE_PUNCTUATION) {
      result += BRAILLE_PUNCTUATION[char];
      continue;
    }

    // Fallback: keep unknown character directly
    result += char;
  }

  return result;
}
