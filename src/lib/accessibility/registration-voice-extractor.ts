/**
 * Registration Voice Extractor
 *
 * Deterministic, privacy-first local extractor for spoken registration inputs.
 * Zero PII (names, emails, credentials) is transmitted to external LLMs.
 */

const BLIND_TRIGGER_REGEX =
  /\b(blind|blinds|blinde|blinded|blindness|i am blind|i'm blind|im blind|voxonix blind|hey voxonix|select blind|choose blind|blind mode|blind profile|i need voice-guided registration|voice guidance|voice guided registration|voice assistant)\b/i;

const SUBMIT_REGEX =
  /\b(submit|create account|sign up|register|complete registration|finish registration|sign in|signin|login|log in|continue|enter|done|confirm account|yes)\b/i;

const CANCEL_REGEX = /\b(stop|cancel|pause|exit|deactivate|turn off)\b/i;

const AFFIRMATIVE_REGEX =
  /\b(yes|yeah|yep|correct|confirm|confirmed|that's right|thats right|it is correct|it's correct|accept|proceed|right|sure)\b/i;

const NEGATIVE_REGEX =
  /\b(no|nope|incorrect|wrong|not right|not correct|retry|change|try again|repeat|re-enter)\b/i;

const SPELL_TRIGGER_REGEX =
  /\b(spell my name|spell name|enter my name letter by letter|enter letter by letter|letter by letter|spelling mode|let me spell|use spelling|spell it|spell)\b/i;

const EMAIL_SPELL_TRIGGER_REGEX =
  /\b(spell my email|spell email|spell email address|enter email letter by letter|enter email character by character|email spelling mode|character by character|letter by letter|let me spell|use spelling|spell it)\b/i;

const EMAIL_CORRECTION_REGEX =
  /\b(repeat email|correct email|change email|delete last character|start email again|spell email|clear email|re-enter email)\b/i;

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

const ONBOARDING_PREFIX_RE =
  /^(?:(?:please|ok|okay|yes|yeah|yep|well|um|uh|actually|just)\s+)*(?:i\s+(?:want|would\s+like|need|prefer)\s+to\s+|(?:i'd|id)\s+like\s+to\s+|let\s+me\s+|(?:can|could|may)\s+i\s+)?/i;

const ONBOARDING_SUFFIX_RE = /(?:\s+(?:please|now|thanks|thank\s+you))+$/i;

const ONBOARDING_REGISTER_EXACT_RE =
  /^(?:(?:a\s+|an\s+|for\s+(?:a\s+|an\s+)?)?(?:new\s+)?(?:register(?:\s+(?:me|now|an?\s+account|a\s+new\s+account|for\s+(?:an?\s+|a\s+new\s+)account))?|registration|sign\s*up|signup|create(?:\s+(?:a|an|new))?\s+account|new\s+account))$/i;

const ONBOARDING_SIGNIN_EXACT_RE =
  /^(?:sign\s*in(?:\s+(?:to\s+(?:my|an|the|existing|my\s+existing)\s+account))?|signin|log\s*in(?:\s+(?:to\s+(?:my|an|the|existing|my\s+existing)\s+account))?|login|(?:to\s+(?:my|an|the)\s+)?(?:use\s+|open\s+|access\s+|into\s+)?(?:my\s+|an\s+)?existing\s+account|(?:i\s+)?already\s+have\s+an\s+account)$/i;

const ONBOARDING_AMBIGUOUS_NEGATION_RE =
  /\b(?:not|don't|dont|do\s+not|never|no|neither|nor|or|instead\s+of)\b/i;

function normalizeOnboardingUtterance(transcript: string): string {
  const cleaned = transcript
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .replace(ONBOARDING_PREFIX_RE, "")
    .replace(ONBOARDING_SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the post-wake onboarding response explicitly selects account registration.
 * Rejects negations, mixed utterances, and unrelated phrases merely containing "register".
 */
export function isOnboardingRegisterChoice(transcript: string): boolean {
  const rawLower = transcript.trim().toLowerCase();
  if (!rawLower || ONBOARDING_AMBIGUOUS_NEGATION_RE.test(rawLower)) return false;
  if (/\b(?:sign\s*in|signin|log\s*in|login|existing\s+account)\b/i.test(rawLower)) {
    return false;
  }
  const normalized = normalizeOnboardingUtterance(rawLower);
  return Boolean(normalized && ONBOARDING_REGISTER_EXACT_RE.test(normalized));
}

/**
 * Returns true if the post-wake onboarding response explicitly selects signing in to an existing account.
 * Rejects negations, mixed utterances, and unrelated phrases.
 */
export function isOnboardingSignInChoice(transcript: string): boolean {
  const rawLower = transcript.trim().toLowerCase();
  if (!rawLower || ONBOARDING_AMBIGUOUS_NEGATION_RE.test(rawLower)) return false;
  if (
    /\b(?:register|registration|sign\s*up|signup|create(?:\s+(?:a|an|new))?\s+account)\b/i.test(
      rawLower,
    )
  ) {
    return false;
  }
  const normalized = normalizeOnboardingUtterance(rawLower);
  return Boolean(normalized && ONBOARDING_SIGNIN_EXACT_RE.test(normalized));
}

/**
 * Returns true if the transcript requests Blind / Low Vision profile selection.
 */
export function isBlindProfilePhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  if (
    text === "blind" ||
    text === "i am blind" ||
    text === "select blind" ||
    text === "choose blind" ||
    text === "voxonix blind"
  ) {
    return true;
  }
  return BLIND_TRIGGER_REGEX.test(text);
}

/**
 * Returns true if the transcript indicates form submission.
 */
export function isSubmitPhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return SUBMIT_REGEX.test(text);
}

/**
 * Returns true if the transcript indicates cancellation or pausing.
 */
export function isCancelPhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return CANCEL_REGEX.test(text);
}

/**
 * Returns true if the transcript indicates user confirmation ("yes", "correct", etc.).
 */
export function isAffirmativePhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  // Ensure "no" is not caught by partial matches
  if (/^(?:no|nope|not correct|wrong)\b/i.test(text)) return false;
  return AFFIRMATIVE_REGEX.test(text);
}

/**
 * Returns true if the transcript indicates rejection or correction ("no", "wrong", etc.).
 */
export function isNegativePhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return NEGATIVE_REGEX.test(text);
}

/**
 * Returns true if the transcript requests name spelling mode.
 */
export function isSpellingTrigger(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return SPELL_TRIGGER_REGEX.test(text);
}

/**
 * Returns true if the transcript requests email spelling mode.
 */
export function isEmailSpellingTrigger(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return EMAIL_SPELL_TRIGGER_REGEX.test(text);
}

export function isSpellingNextTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:next|next word|surname|last name|second name|done(?: with first name)?|finish(?: first name)?|move to surname)$/i.test(
    cleaned,
  );
}

export function isSpellingDoneTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:done|finish|finished|complete|completed|that is all|thats all|that's all)$/i.test(
    cleaned,
  );
}

export function isSpellingNextChunkOrDoneTrigger(transcript: string): boolean {
  return isSpellingDoneTrigger(transcript) || isSpellingNextTrigger(transcript);
}

export function isSpellingSkipTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:skip|no surname|no last name|none|single name)$/i.test(cleaned);
}

export function isSpellingBackspaceTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:backspace|delete|delete\s+(?:the\s+)?last(?:\s+(?:letter|character))?|delete\s+(?:letter|character)|clear\s+(?:the\s+)?last\s+(?:letter|character)|remove\s+(?:the\s+)?last(?:\s+(?:letter|character))?|undo|remove)$/i.test(
    cleaned,
  );
}

export function isSpellingRepeatLetterTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:repeat(?:\s+the)?(?:\s+last)?\s+letter|repeat\s+(?:the\s+)?last\s+character|say\s+(?:the\s+)?last\s+letter)$/i.test(
    cleaned,
  );
}

export function isSpellingContinueTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:continue|continue\s+spelling|keep\s+going)$/i.test(cleaned);
}

export function isSpellingClearTrigger(transcript: string): boolean {
  const cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:clear|clear all|clear word|reset|erase|start over)$/i.test(cleaned);
}

/**
 * Returns true if the transcript requests email correction.
 */
export function isEmailCorrectionPhrase(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return EMAIL_CORRECTION_REGEX.test(text);
}

export interface ExtractedNameResult {
  name: string;
  valid: boolean;
  error?: string;
}

/**
 * Single shared deterministic ordinary spoken alphabet mapping (A-Z + Indian-English
 * letter-name pronunciation variants recognized cleanly by Gnani Prisma verbatim mode).
 * Reused across Name spelling, Email spelling, Password entry, and Confirm Password.
 */
export const ORDINARY_LETTER_TOKEN_MAP: Record<string, string> = {
  // Single ASCII letters
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
  f: "F",
  g: "G",
  h: "H",
  i: "I",
  j: "J",
  k: "K",
  l: "L",
  m: "M",
  n: "N",
  o: "O",
  p: "P",
  q: "Q",
  r: "R",
  s: "S",
  t: "T",
  u: "U",
  v: "V",
  w: "W",
  x: "X",
  y: "Y",
  z: "Z",
  // Ordinary spoken letter names & Indian-English ASR homophones
  ay: "A",
  ae: "A",
  ei: "A",
  ey: "A",
  be: "B",
  bee: "B",
  bi: "B",
  ce: "C",
  cee: "C",
  sea: "C",
  see: "C",
  si: "C",
  de: "D",
  dee: "D",
  di: "D",
  ee: "E",
  iy: "E",
  ef: "F",
  eff: "F",
  eph: "F",
  ge: "G",
  gee: "G",
  ji: "G",
  jee: "G",
  aitch: "H",
  haitch: "H",
  hetch: "H",
  etch: "H",
  ech: "H",
  ach: "H",
  hach: "H",
  hech: "H",
  eye: "I",
  aye: "I",
  ai: "I",
  jay: "J",
  jey: "J",
  je: "J",
  jae: "J",
  kay: "K",
  ke: "K",
  keh: "K",
  kae: "K",
  el: "L",
  ell: "L",
  em: "M",
  en: "N",
  enn: "N",
  oh: "O",
  owe: "O",
  pe: "P",
  pea: "P",
  pee: "P",
  pi: "P",
  cue: "Q",
  queue: "Q",
  kyu: "Q",
  kew: "Q",
  ar: "R",
  are: "R",
  aar: "R",
  es: "S",
  ess: "S",
  te: "T",
  tea: "T",
  tee: "T",
  ti: "T",
  you: "U",
  yu: "U",
  ewe: "U",
  ve: "V",
  vee: "V",
  vi: "V",
  "double-u": "W",
  "double-you": "W",
  doubleu: "W",
  ex: "X",
  eks: "X",
  why: "Y",
  wye: "Y",
  wai: "Y",
  zed: "Z",
  zee: "Z",
  zi: "Z",
  zeth: "Z",
  zad: "Z",
};

/**
 * Shared ordinary alphabet letter token decoder.
 * Decodes single letters, two-word W ("double you" / "double u"), and spoken letter names.
 * Strips trailing sentence punctuation attached to alphabetic tokens cleanly, and
 * returns null for ambiguous or unrecognized multi-letter words rather than guessing.
 */
export function decodeOrdinaryLetterToken(
  rawToken: string,
  rawNextToken?: string,
): { letter: string; consumed: 1 | 2 } | null {
  const token = rawToken
    .trim()
    .toLowerCase()
    .replace(/(?<=[a-z])[.,;!?]+$/g, "");
  const nextToken = (rawNextToken || "")
    .trim()
    .toLowerCase()
    .replace(/(?<=[a-z])[.,;!?]+$/g, "");
  if (!token) return null;

  if (token === "double" && (nextToken === "you" || nextToken === "u")) {
    return { letter: "W", consumed: 2 };
  }

  const mapped = ORDINARY_LETTER_TOKEN_MAP[token];
  if (mapped) {
    return { letter: mapped, consumed: 1 };
  }

  return null;
}

/**
 * Expands dot/hyphen-separated ASR letter artifacts (e.g. "R.I.S.H.A.N" or "R-I-S-H-A-N." in name mode)
 * strictly when every sub-part decodes as an explicit ordinary letter. Never splits ordinary prose words.
 */
export function expandSegmentedSpellTokens(tokens: string[], allowHyphenSplit: boolean): string[] {
  const expanded: string[] = [];
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    if (/^[a-z](?:\.[a-z])+\.?$/i.test(token)) {
      const parts = token.split(".").filter(Boolean);
      expanded.push(...parts);
      continue;
    }

    const trimmedPunct = token.replace(/(?<=[a-z0-9])[.,;!?]+$/i, "");

    if (
      allowHyphenSplit &&
      (trimmedPunct.includes("-") || trimmedPunct.includes("/")) &&
      !ORDINARY_LETTER_TOKEN_MAP[trimmedPunct.toLowerCase()]
    ) {
      const parts = trimmedPunct.split(/[-/]+/).filter(Boolean);
      if (parts.length >= 2 && parts.every((part) => decodeOrdinaryLetterToken(part) !== null)) {
        expanded.push(...parts);
        continue;
      }
    }

    expanded.push(trimmedPunct || token);
  }
  return expanded;
}

/**
 * Deterministically extracts the user's full name from spoken phrases or letter-by-letter spelling.
 */
export function extractSpokenName(transcript: string): ExtractedNameResult {
  const text = transcript.trim();
  if (!text) {
    return { name: "", valid: false, error: "Please say or spell your full name." };
  }

  if (isBlindProfilePhrase(text)) {
    return { name: "", valid: false, error: "Profile phrase detected, not a name." };
  }

  const sanitized = text
    .replace(/[.,!?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let cleaned = sanitized
    .replace(
      /^(?:(?:hello|hi|hey|um|uh|please)\s+)?(?:my name is|my full name is|full name is|i am|i'm|name is|call me|this is|it is|it's|myself|user|change name to|please enter my name as|enter my name as|the name is|enter name|spell my name as|spell name as|spell my name|spell name|spell)\s+/i,
      "",
    )
    .trim();

  cleaned = cleaned.replace(/^(?:i am|i'm|my name is)\s+/i, "").trim();

  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  const hasSpaceWord = /\b(?:space|blank|next word|new word)\b/i.test(cleaned);
  const hasSpelledLetters = /\b[a-zA-Z]\s+[a-zA-Z]\b/.test(cleaned);
  const decodedCount = words.filter((w) => Boolean(ORDINARY_LETTER_TOKEN_MAP[w])).length;

  if (hasSpaceWord || hasSpelledLetters || decodedCount >= 2) {
    return parseSpelledName(cleaned);
  }

  if (cleaned.length < 2) {
    return {
      name: cleaned,
      valid: false,
      error: "Name must be at least 2 characters long.",
    };
  }

  if (cleaned.length > 64) {
    return {
      name: cleaned.slice(0, 64),
      valid: false,
      error: "Name must be 64 characters or fewer.",
    };
  }

  return { name: cleaned.toUpperCase(), valid: true };
}

function getInlineLetterPhraseSkip(tokens: string[], index: number): number {
  const token = (tokens[index] || "").trim().toLowerCase();
  const next = (tokens[index + 1] || "").trim().toLowerCase();
  let targetIdx = -1;

  if (token === "the" && next === "letter") {
    targetIdx = index + 2;
  } else if (token === "letter") {
    targetIdx = index + 1;
  } else {
    return 0;
  }

  if ((tokens[targetIdx] || "").trim().toLowerCase() === "is") {
    targetIdx += 1;
  }

  if (
    targetIdx < tokens.length &&
    decodeOrdinaryLetterToken(tokens[targetIdx], tokens[targetIdx + 1]) !== null
  ) {
    return targetIdx - index;
  }
  return 0;
}

function isConjunctionBeforeLetter(
  tokens: string[],
  index: number,
  hasDecodedPriorLetter: boolean,
): boolean {
  if (!hasDecodedPriorLetter) return false;
  if ((tokens[index] || "").trim().toLowerCase() !== "and") return false;
  const next = (tokens[index + 1] || "").trim().toLowerCase();
  if (!next || next === "sign" || next === "rate") return false;
  return (
    decodeOrdinaryLetterToken(tokens[index + 1], tokens[index + 2]) !== null ||
    getInlineLetterPhraseSkip(tokens, index + 1) > 0
  );
}

/**
 * Whole-name ordinary letter spelling parser.
 * Concatenates spoken alphabet letters cleanly in order, creating word boundaries
 * strictly on explicit "space" / "next word" / "new word" / "blank" tokens.
 */
export function parseSpelledName(transcript: string): ExtractedNameResult {
  const text = transcript.trim();
  if (!text) {
    return { name: "", valid: false, error: "Please spell your full name using ordinary letters." };
  }

  let sanitized = text
    .replace(/(?<=[a-zA-Z0-9])[.,;!?"'’]+(?=\s|$)/g, " ")
    .replace(/[,;!?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  sanitized = sanitized
    .replace(
      /^(?:(?:hello|hi|hey|um|uh|please)\s+)?(?:my name is|i am|i'm|name is|call me|this is|it is|it's|myself|user|change name to|please enter my name as|enter my name as|the name is|enter name|spell my name as|spell name as|spell my name|spell name|spell)\s+/i,
      "",
    )
    .replace(/(?<=[a-zA-Z0-9])[.]+\s*/g, " ")
    .trim();

  sanitized = sanitized.replace(/^(?:i am|i'm|my name is)\s+/i, "").trim();

  const rawTokens = sanitized.toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = expandSegmentedSpellTokens(rawTokens, true);
  const words: string[] = [];
  let currentWord = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) continue;

    const nextToken = tokens[i + 1] || "";
    const twoWordToken = `${token} ${nextToken}`;

    if (
      token === "space" ||
      token === "blank" ||
      twoWordToken === "next word" ||
      twoWordToken === "new word"
    ) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = "";
      }
      if (twoWordToken === "next word" || twoWordToken === "new word") {
        i++;
      }
      continue;
    }

    if (token === "backspace" || token === "delete") {
      if (currentWord.length > 0) {
        currentWord = currentWord.slice(0, -1);
      } else if (words.length > 0) {
        const last = words.pop()!;
        currentWord = last.slice(0, -1);
      }
      continue;
    }

    if (twoWordToken === "delete letter") {
      if (currentWord.length > 0) {
        currentWord = currentWord.slice(0, -1);
      }
      i++;
      continue;
    }

    if (twoWordToken === "clear word" || token === "clear") {
      currentWord = "";
      if (twoWordToken === "clear word") i++;
      continue;
    }

    if (twoWordToken === "start again" || token === "restart") {
      words.length = 0;
      currentWord = "";
      if (twoWordToken === "start again") i++;
      continue;
    }

    if (token === "done" || token === "finish" || token === "finished" || token === "submit") {
      break;
    }

    const wrapperSkip = getInlineLetterPhraseSkip(tokens, i);
    if (wrapperSkip > 0) {
      i += wrapperSkip - 1;
      continue;
    }

    if (isConjunctionBeforeLetter(tokens, i, currentWord.length > 0 || words.length > 0)) {
      continue;
    }

    const decoded = decodeOrdinaryLetterToken(token, nextToken);
    if (decoded) {
      currentWord += decoded.letter;
      if (decoded.consumed === 2) i++;
      continue;
    }

    if (token === "double" && nextToken) {
      const doubled = decodeOrdinaryLetterToken(nextToken, tokens[i + 2]);
      if (doubled) {
        currentWord += doubled.letter + doubled.letter;
        i += doubled.consumed;
        continue;
      }
    }

    return {
      name: [...words, currentWord].filter(Boolean).join(" ").trim(),
      valid: false,
      error: `Unable to recognise "${token}" as an alphabet letter. Say each letter separately or say space between words.`,
    };
  }

  if (currentWord) {
    words.push(currentWord);
  }

  const result = words.join(" ").trim();
  if (result.length < 2) {
    return {
      name: result,
      valid: false,
      error: "Spelled name must contain at least 2 characters.",
    };
  }

  return { name: result, valid: true };
}

/**
 * Parses a chunk of ordinary spoken alphabet letters (for first name or surname) using the
 * shared ordinary letter decoder. Preserves any leading decoded letters when an uncertain
 * trailing token is encountered so callers can prompt a single-letter retry cleanly.
 */
export function parseSpelledWordLetters(transcript: string): {
  letters: string;
  trailingLetters?: string;
  sawSpace?: boolean;
  valid: boolean;
  controlAction?: "next" | "done" | "backspace" | "clear" | "skip" | "repeat_letter" | "continue";
  invalidToken?: string;
  error?: string;
} {
  const cleaned = transcript
    .trim()
    .replace(/(?<=[a-zA-Z0-9])[.,;!?"'’]+(?=\s|$)/g, " ")
    .replace(/[,;!?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return {
      letters: "",
      valid: false,
      error:
        "I did not hear any letters. Please spell each letter separately, for example R, I, S, H, A, N.",
    };
  }

  if (isSpellingBackspaceTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "backspace" };
  }
  if (isSpellingClearTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "clear" };
  }
  if (isSpellingSkipTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "skip" };
  }
  if (isSpellingRepeatLetterTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "repeat_letter" };
  }
  if (isSpellingContinueTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "continue" };
  }
  if (isSpellingNextTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "next" };
  }
  if (isSpellingDoneTrigger(cleaned)) {
    return { letters: "", valid: true, controlAction: "done" };
  }

  const withoutPrefix = cleaned
    .replace(
      /^(?:the\s+letters\s+are|letters\s+are|letters|first\s+name\s+is|surname\s+is|last\s+name\s+is|it\s+is|it's)\s+/i,
      "",
    )
    .trim();

  const rawTokens = withoutPrefix.toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = expandSegmentedSpellTokens(rawTokens, true);
  let beforeSpace = "";
  let afterSpace = "";
  let sawSpace = false;
  let controlAction: "next" | "done" | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1] || "";
    const twoWord = `${token} ${nextToken}`;

    if (i === tokens.length - 1 && /^(?:done|finish|finished|complete|completed)$/i.test(token)) {
      controlAction = "done";
      break;
    }
    if (
      (i === tokens.length - 1 && /^(?:next|surname)$/i.test(token)) ||
      (i === tokens.length - 2 && (twoWord === "next word" || twoWord === "last name"))
    ) {
      controlAction = "next";
      break;
    }

    if (token === "space" || token === "blank") {
      sawSpace = true;
      continue;
    }

    if (twoWord === "next word" || twoWord === "new word") {
      sawSpace = true;
      i++;
      continue;
    }

    const wrapperSkip = getInlineLetterPhraseSkip(tokens, i);
    if (wrapperSkip > 0) {
      i += wrapperSkip - 1;
      continue;
    }

    if (
      isConjunctionBeforeLetter(
        tokens,
        i,
        sawSpace ? afterSpace.length > 0 : beforeSpace.length > 0,
      )
    ) {
      continue;
    }

    const decoded = decodeOrdinaryLetterToken(token, nextToken);
    if (decoded) {
      if (sawSpace) afterSpace += decoded.letter;
      else beforeSpace += decoded.letter;
      if (decoded.consumed === 2) i++;
      continue;
    }

    if (token === "double" && nextToken) {
      const doubled = decodeOrdinaryLetterToken(nextToken, tokens[i + 2]);
      if (doubled) {
        const pair = doubled.letter + doubled.letter;
        if (sawSpace) afterSpace += pair;
        else beforeSpace += pair;
        i += doubled.consumed;
        continue;
      }
    }

    return {
      letters: beforeSpace,
      trailingLetters: afterSpace || undefined,
      sawSpace,
      valid: false,
      invalidToken: token,
      error: `Unable to recognise the letter "${token}". Please repeat the last letter.`,
    };
  }

  if (!beforeSpace && !afterSpace && !sawSpace && !controlAction) {
    return {
      letters: "",
      valid: false,
      error: "Please spell each letter separately, or say done when finished.",
    };
  }

  return {
    letters: beforeSpace,
    trailingLetters: afterSpace || undefined,
    sawSpace,
    valid: true,
    controlAction,
  };
}

/**
 * Formats a reconstructed name with readable pronunciation and exact character-by-character spelling
 * so Blind users immediately hear every letter and space.
 */
export function formatNameForReadback(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  const readableWords = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const nonSpaceCount = words.join("").length;
  if (nonSpaceCount > 28) {
    return readableWords;
  }
  const spelledWords = words.map((w) => w.toUpperCase().split("").join(", "));
  return `${readableWords}, spelled: ${spelledWords.join(", space, ")}`;
}

export function formatSpelledLettersForTts(letters: string): string {
  return letters
    .toUpperCase()
    .split("")
    .map((ch) => (ch === " " ? "space" : ch))
    .join(", ");
}

/**
 * Spoken digit words to character mappings.
 */
const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  fore: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
};

const STRICT_SINGLE_DIGIT_MAP: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

export interface ExtractedEmailResult {
  email: string;
  valid: boolean;
  error?: string;
  readbackText?: string;
}

/**
 * Dedicated email dictation normalizer.
 * Preserves EVERY digit, including trailing numbers (such as 05 in rishanmenezes05@gmail.com).
 * Recognizes Indian-English "at the rate", spoken numbers ("zero five", "oh five"),
 * at, dot, underscore, dash, hyphen, plus.
 */
export function normalizeSpokenEmail(transcript: string): ExtractedEmailResult {
  const text = transcript.trim();
  if (!text) {
    return {
      email: "",
      valid: false,
      error:
        "Please say your email address, or say spell email to enter it character by character.",
    };
  }

  // Strip conversational introductory prefixes
  let cleaned = text
    .toLowerCase()
    .replace(/[,;?!"'’]/g, " ")
    .replace(
      /^(?:(?:hello|hi|hey|um|uh|please)\s+)?(?:my email id is|my email address is|my email is|my gmail is|email id is|email address is|email is|email id|change email to|the email is|enter email|spell email|spell my email|it is|it's)\s+/i,
      "",
    )
    .trim();

  // Normalize compound tens+units like "twenty four" -> "24" BEFORE mapping standalone words
  cleaned = cleaned.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s]+(one|two|to|too|three|four|for|fore|five|six|seven|eight|ate|nine)\b/gi,
    (_, tens, unit) => {
      const tensVal = Number(SPOKEN_DIGIT_MAP[tens.toLowerCase()] || 0);
      const unitVal = Number(SPOKEN_DIGIT_MAP[unit.toLowerCase()] || 0);
      return tensVal && unitVal ? String(tensVal + unitVal) : `${tens} ${unit}`;
    },
  );

  // Normalize "triple [digit]" e.g. "triple zero" -> "000"
  cleaned = cleaned.replace(
    /\btriple\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine|\d)\b/gi,
    (_, digitWord) => {
      const d = SPOKEN_DIGIT_MAP[digitWord.toLowerCase()] || digitWord;
      return `${d}${d}${d}`;
    },
  );

  // Normalize "double [digit]" e.g. "double zero" -> "00", "double five" -> "55"
  cleaned = cleaned.replace(
    /\bdouble\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine|\d)\b/gi,
    (_, digitWord) => {
      const d = SPOKEN_DIGIT_MAP[digitWord.toLowerCase()] || digitWord;
      return `${d}${d}`;
    },
  );

  // Normalize spoken numbers like "zero five" or "oh five"
  cleaned = cleaned.replace(
    /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, a, b) => {
      const d1 = SPOKEN_DIGIT_MAP[a.toLowerCase()] ?? a;
      const d2 = SPOKEN_DIGIT_MAP[b.toLowerCase()] ?? b;
      return `${d1}${d2}`;
    },
  );

  // Convert individual number words to digits: "zero" -> 0, "five" -> 5, etc.
  cleaned = cleaned.replace(
    /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (match) => {
      return SPOKEN_DIGIT_MAP[match.toLowerCase()] ?? match;
    },
  );

  // Convert spoken separators with boundary matching ("at the rate" before standalone "at")
  cleaned = cleaned
    .replace(
      /\b(?:at\s+the\s+rate(?:\s+of)?|add\s+the\s+rate(?:\s+of)?|at\s+rate|at\s+sign|at\s+symbol|at)\b/gi,
      "@",
    )
    .replace(/\b(?:dot|period|point)\b/gi, ".")
    .replace(/\b(?:under\s+score|underscore)\b/gi, "_")
    .replace(/\b(?:high\s*fen|hi\s*fen|dash|hyphen|minus)\b/gi, "-")
    .replace(/\b(?:plus sign|plus)\b/gi, "+")
    .replace(/\bspace\b/gi, "")
    .replace(/[^a-zA-Z0-9@._+-]/g, "")
    .replace(/\.+$/, "");

  const isValid = EMAIL_REGEX.test(cleaned);

  if (!isValid) {
    return {
      email: cleaned,
      valid: false,
      error:
        "Could not parse a valid complete email address. Spell each username letter before the at sign, say at sign, then your email domain.",
    };
  }

  return { email: cleaned, valid: true };
}

const KNOWN_EMAIL_DOMAIN_WORDS = new Set([
  "gmail",
  "yahoo",
  "outlook",
  "hotmail",
  "protonmail",
  "proton",
  "icloud",
  "live",
  "msn",
  "zoho",
  "rediffmail",
  "ymail",
  "aol",
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "in",
  "co",
  "ac",
  "me",
  "io",
  "info",
  "biz",
]);

/**
 * Parses an incremental email spelling utterance using the shared ordinary alphabet decoder
 * plus digits and explicit email symbols. Rejects spaces and unrecognised words without guessing,
 * and allows spoken known provider/TLD words only after the '@' symbol has been entered.
 */
export function parseSpelledEmailChunk(
  transcript: string,
  options?: { currentBuffer?: string },
): {
  chunk: string;
  endRequested: boolean;
  valid: boolean;
  invalidToken?: string;
  error?: string;
} {
  let cleaned = transcript
    .trim()
    .toLowerCase()
    .replace(/[,;!?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return {
      chunk: "",
      endRequested: false,
      valid: false,
      error: "Please spell email characters clearly, or say done when finished.",
    };
  }

  cleaned = cleaned
    .replace(/^(?:add|append|email\s+is|next\s+characters?\s+are)\s+/i, "")
    .replace(/(?<=[a-z0-9])\.+(?=\s|$)/gi, "")
    .trim();

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens = expandSegmentedSpellTokens(rawTokens, false);
  let out = "";
  let endRequested = false;
  let seenAt = Boolean(options?.currentBuffer?.includes("@"));
  let expectDigit = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1] || "";
    const next2 = tokens[i + 2] || "";
    const threeWord = `${token} ${next} ${next2}`;
    const twoWord = `${token} ${next}`;

    if (i === tokens.length - 1 && /^(?:done|finish|finished|complete|completed)$/i.test(token)) {
      if (expectDigit) {
        return {
          chunk: out,
          endRequested: false,
          valid: false,
          error: "Expected a digit after number. Please repeat the digits clearly.",
        };
      }
      endRequested = true;
      break;
    }

    if (token === "space" || token === "blank") {
      return {
        chunk: out,
        endRequested: false,
        valid: false,
        invalidToken: token,
        error: "Spaces are not allowed in email addresses. Continue spelling without spaces.",
      };
    }

    if (expectDigit) {
      if (
        token === "double" &&
        (STRICT_SINGLE_DIGIT_MAP[next] || next === "oh" || /^\d$/.test(next))
      ) {
        const d = STRICT_SINGLE_DIGIT_MAP[next] || (next === "oh" ? "0" : next);
        out += d + d;
        expectDigit = false;
        i++;
        continue;
      }
      if (STRICT_SINGLE_DIGIT_MAP[token] || token === "oh") {
        out += STRICT_SINGLE_DIGIT_MAP[token] || "0";
        expectDigit = false;
        continue;
      }
      if (/^\d+$/.test(token)) {
        out += token;
        expectDigit = false;
        continue;
      }
      return {
        chunk: out,
        endRequested: false,
        valid: false,
        invalidToken: token,
        error: `Expected a digit after number, but heard "${token}".`,
      };
    }

    if (token === "number" || token === "digit") {
      expectDigit = true;
      continue;
    }

    if (threeWord === "at the rate" || (twoWord === "add the" && next2 === "rate")) {
      if (seenAt) {
        return {
          chunk: out,
          endRequested: false,
          valid: false,
          invalidToken: threeWord,
          error: "Your email already contains an at sign. Spell the domain name after the at sign.",
        };
      }
      if (tokens[i + 3] === "of") i += 3;
      else i += 2;
      out += "@";
      seenAt = true;
      continue;
    }
    if (
      twoWord === "at sign" ||
      twoWord === "at symbol" ||
      twoWord === "at rate" ||
      twoWord === "the rate"
    ) {
      if (seenAt) {
        return {
          chunk: out,
          endRequested: false,
          valid: false,
          invalidToken: twoWord,
          error: "Your email already contains an at sign. Spell the domain name after the at sign.",
        };
      }
      out += "@";
      seenAt = true;
      i++;
      continue;
    }
    if (token === "at" || token === "@") {
      if (seenAt) {
        return {
          chunk: out,
          endRequested: false,
          valid: false,
          invalidToken: token,
          error: "Your email already contains an at sign. Spell the domain name after the at sign.",
        };
      }
      out += "@";
      seenAt = true;
      continue;
    }
    if (token === "dot" || token === "period" || token === "point" || token === ".") {
      out += ".";
      continue;
    }
    if (twoWord === "under score" || token === "underscore" || token === "_") {
      if (twoWord === "under score") i++;
      out += "_";
      continue;
    }
    if (
      twoWord === "high fen" ||
      twoWord === "hi fen" ||
      token === "dash" ||
      token === "hyphen" ||
      token === "minus" ||
      token === "-"
    ) {
      if (twoWord === "high fen" || twoWord === "hi fen") i++;
      out += "-";
      continue;
    }
    if (twoWord === "plus sign" || token === "plus" || token === "+") {
      if (twoWord === "plus sign") i++;
      out += "+";
      continue;
    }

    const wrapperSkip = getInlineLetterPhraseSkip(tokens, i);
    if (wrapperSkip > 0) {
      i += wrapperSkip - 1;
      continue;
    }

    if (isConjunctionBeforeLetter(tokens, i, out.length > 0)) {
      continue;
    }

    // Two-word W ("double you" / "double u") before general "double <x>"
    const letterDecoded = decodeOrdinaryLetterToken(token, next);
    if (letterDecoded && letterDecoded.consumed === 2) {
      out += letterDecoded.letter.toLowerCase();
      i++;
      continue;
    }

    // "double <digit/letter>"
    if (token === "double" && next) {
      const doubledDigit =
        STRICT_SINGLE_DIGIT_MAP[next] ||
        (next === "oh" ? "0" : "") ||
        (/^\d$/.test(next) ? next : "");
      if (doubledDigit) {
        out += doubledDigit + doubledDigit;
        i++;
        continue;
      }
      const doubledLetter = decodeOrdinaryLetterToken(next, next2);
      if (doubledLetter) {
        const ch = doubledLetter.letter.toLowerCase();
        out += ch + ch;
        i += doubledLetter.consumed;
        continue;
      }
    }

    // Context-sensitive "oh" + digit ("oh five" -> "05") vs standalone "oh" -> letter "o"
    if (token === "oh" && (STRICT_SINGLE_DIGIT_MAP[next] || /^\d$/.test(next))) {
      out += "0";
      continue;
    }

    if (STRICT_SINGLE_DIGIT_MAP[token]) {
      out += STRICT_SINGLE_DIGIT_MAP[token];
      continue;
    }
    if (/^\d+$/.test(token)) {
      out += token;
      continue;
    }

    // Domain provider / TLD recognition allowed ONLY after `@`
    if (seenAt) {
      if (KNOWN_EMAIL_DOMAIN_WORDS.has(token)) {
        out += token;
        continue;
      }
      if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(token)) {
        const domainParts = token.split(".").filter(Boolean);
        if (domainParts.every((part) => KNOWN_EMAIL_DOMAIN_WORDS.has(part))) {
          out += token.toLowerCase();
          continue;
        }
      }
    }

    if (letterDecoded) {
      out += letterDecoded.letter.toLowerCase();
      continue;
    }

    return {
      chunk: out,
      endRequested: false,
      valid: false,
      invalidToken: token,
      error: seenAt
        ? `Unable to recognise "${token}" in the email domain. Spell unfamiliar domains one letter at a time, say dot, or say your email provider.`
        : `Unable to recognise "${token}" as a letter, digit, or email symbol. Please repeat the last character.`,
    };
  }

  if (expectDigit) {
    return {
      chunk: "",
      endRequested: false,
      valid: false,
      error: "Expected a digit after number. Please repeat the digits clearly.",
    };
  }

  if (!out && !endRequested) {
    return {
      chunk: "",
      endRequested: false,
      valid: false,
      error: "No valid email characters detected. Spell each letter separately or say done.",
    };
  }

  return { chunk: out, endRequested, valid: true };
}

/**
 * Creates friendly, unambiguous readback text for screen reader / TTS audio confirmation.
 * Reads full email plus spelled username characters so subtle ASR mistakes are immediately audible.
 */
export function formatEmailForReadback(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const domainSpoken = domain.replace(/\./g, " dot ");
  if (local.length <= 32) {
    const spelledLocal = local
      .split("")
      .map((c) => (c === "." ? "dot" : c === "_" ? "underscore" : c === "-" ? "dash" : c))
      .join(", ");
    return `${local} at ${domainSpoken}. Username spelled: ${spelledLocal}`;
  }
  return `${local} at ${domainSpoken}`;
}

export function formatEmailBufferForReadback(buffer: string): string {
  if (!buffer) return "empty";
  return buffer
    .split("")
    .map((c) =>
      c === "@" ? "at" : c === "." ? "dot" : c === "_" ? "underscore" : c === "-" ? "dash" : c,
    )
    .join(", ");
}

export interface ExtractedPasswordResult {
  password: string;
  valid: boolean;
  endRequested?: boolean;
  error?: string;
}

const PWD_UPPER_MODIFIERS = new Set(["capital", "cap", "caps", "uppercase", "upper", "big"]);
const PWD_LOWER_MODIFIERS = new Set(["lowercase", "lower", "small"]);
const PWD_NUMBER_MODIFIERS = new Set(["number", "digit"]);

const PWD_MULTIWORD_SYMBOLS: Record<string, string> = {
  "at the rate of": "@",
  "at the rate": "@",
  "add the rate": "@",
  "at sign": "@",
  "at symbol": "@",
  "at rate": "@",
  "exclamation mark": "!",
  "exclamation point": "!",
  "question mark": "?",
  "number sign": "#",
  "pound sign": "#",
  "hash tag": "#",
  "dollar sign": "$",
  "percent sign": "%",
  "plus sign": "+",
  "minus sign": "-",
  "equal sign": "=",
  "equals sign": "=",
  "under score": "_",
  "high fen": "-",
  "hi fen": "-",
  "forward slash": "/",
  "back slash": "\\",
  "semi colon": ";",
  "and sign": "&",
  "power sign": "^",
  "open parenthesis": "(",
  "left parenthesis": "(",
  "open paren": "(",
  "left paren": "(",
  "open bracket": "(",
  "left bracket": "(",
  "close parenthesis": ")",
  "right parenthesis": ")",
  "close paren": ")",
  "right paren": ")",
  "close bracket": ")",
  "right bracket": ")",
};

const PWD_SINGLE_SYMBOLS: Record<string, string> = {
  at: "@",
  dot: ".",
  period: ".",
  point: ".",
  underscore: "_",
  dash: "-",
  hyphen: "-",
  minus: "-",
  exclamation: "!",
  bang: "!",
  hash: "#",
  hashtag: "#",
  pound: "#",
  dollar: "$",
  percent: "%",
  percentage: "%",
  caret: "^",
  hat: "^",
  ampersand: "&",
  asterisk: "*",
  star: "*",
  plus: "+",
  equals: "=",
  equal: "=",
  question: "?",
  slash: "/",
  backslash: "\\",
  colon: ":",
  semicolon: ";",
  tilde: "~",
  tilda: "~",
  comma: ",",
};

const PWD_FORCED_DIGIT_WORDS: Record<string, string> = {
  ...STRICT_SINGLE_DIGIT_MAP,
  o: "0",
  oh: "0",
  owe: "0",
  won: "1",
  to: "2",
  too: "2",
  for: "4",
  fore: "4",
  ate: "8",
};

const LITERAL_SYMBOL_ONLY_RE = /^[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|~]+$/;

/**
 * Deterministic character-by-character password dictation parser.
 * - Supports explicit case prefixes ("capital A", "lowercase b", "uppercase R", "small x")
 * - Defaults unprefixed letters to lowercase so ASR sentence-capitalization never introduces mismatches
 * - Preserves digits ("zero".."nine", "number 7") and symbols ("at sign", "underscore", "dot", "#", etc.)
 * - Rejects ambiguous multi-letter prose or dangling modifiers rather than corrupting the password
 */
export function parseSpelledPassword(transcript: string): ExtractedPasswordResult {
  const raw = transcript.trim();
  if (!raw) {
    return {
      password: "",
      valid: false,
      error:
        "No password speech detected. Please dictate character by character, for example: capital A, lowercase b, c, number 7, at sign.",
    };
  }

  // Strip comma/semicolon/sentence-pause punctuation only after alphanumeric tokens
  let cleaned = raw
    .replace(/([a-zA-Z0-9])[.,;!?]+\s+/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip trailing sentence punctuation after alphanumeric words/letters without stripping standalone symbols
  cleaned = cleaned.replace(/(?<=[a-zA-Z0-9])[.,;!?]+$/, "").trim();

  // Strip anchored conversational wrappers without touching actual single-letter prefixes
  cleaned = cleaned
    .replace(/^(?:my\s+password\s+is|confirm\s+password\s+is|password\s+is)\s+/i, "")
    .trim();

  if (!cleaned) {
    return {
      password: "",
      valid: false,
      error: "Please dictate your password character by character.",
    };
  }

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens = expandSegmentedSpellTokens(rawTokens, false);
  let password = "";
  let pendingCase: "upper" | "lower" | null = null;
  let expectDigit = false;
  let endRequested = false;

  for (let i = 0; i < tokens.length; i++) {
    const rawToken = tokens[i];
    const token = rawToken.toLowerCase();
    const next = (tokens[i + 1] || "").toLowerCase();
    const next2 = (tokens[i + 2] || "").toLowerCase();
    const next3 = (tokens[i + 3] || "").toLowerCase();

    if (
      i === tokens.length - 1 &&
      (token === "done" || token === "finish" || token === "finished" || token === "next")
    ) {
      if (pendingCase !== null || expectDigit) {
        return {
          password: "",
          valid: false,
          error:
            "Incomplete modifier before done or next. Please repeat those password characters.",
        };
      }
      endRequested = true;
      break;
    }

    // Normalize two-word case modifiers ("upper case", "lower case")
    const twoWord = `${token} ${next}`;
    if (twoWord === "upper case") {
      if (expectDigit) {
        return {
          password: "",
          valid: false,
          error: "Ambiguous modifier sequence detected. Please repeat those password characters.",
        };
      }
      pendingCase = "upper";
      i++;
      continue;
    }
    if (twoWord === "lower case") {
      if (expectDigit) {
        return {
          password: "",
          valid: false,
          error: "Ambiguous modifier sequence detected. Please repeat those password characters.",
        };
      }
      pendingCase = "lower";
      i++;
      continue;
    }

    // Check 4-word and 3-word and 2-word symbols BEFORE single-word "number" modifier ("number sign" -> "#")
    const fourWord = `${token} ${next} ${next2} ${next3}`;
    const threeWord = `${token} ${next} ${next2}`;
    if (PWD_MULTIWORD_SYMBOLS[fourWord]) {
      if (pendingCase !== null || expectDigit) {
        return {
          password: "",
          valid: false,
          error: "Ambiguous modifier before a symbol. Please repeat those password characters.",
        };
      }
      password += PWD_MULTIWORD_SYMBOLS[fourWord];
      i += 3;
      continue;
    }
    if (PWD_MULTIWORD_SYMBOLS[threeWord]) {
      if (pendingCase !== null || expectDigit) {
        return {
          password: "",
          valid: false,
          error: "Ambiguous modifier before a symbol. Please repeat those password characters.",
        };
      }
      password += PWD_MULTIWORD_SYMBOLS[threeWord];
      i += 2;
      continue;
    }
    if (PWD_MULTIWORD_SYMBOLS[twoWord]) {
      if (pendingCase !== null || expectDigit) {
        return {
          password: "",
          valid: false,
          error: "Ambiguous modifier before a symbol. Please repeat those password characters.",
        };
      }
      password += PWD_MULTIWORD_SYMBOLS[twoWord];
      i += 1;
      continue;
    }

    // Single-word case or number modifiers
    if (PWD_UPPER_MODIFIERS.has(token)) {
      if (expectDigit) {
        return {
          password: "",
          valid: false,
          error:
            "Ambiguous modifier combination. Say capital or small before letters, and number before digits.",
        };
      }
      pendingCase = "upper";
      continue;
    }
    if (PWD_LOWER_MODIFIERS.has(token)) {
      if (expectDigit) {
        return {
          password: "",
          valid: false,
          error:
            "Ambiguous modifier combination. Say capital or small before letters, and number before digits.",
        };
      }
      pendingCase = "lower";
      continue;
    }
    if (PWD_NUMBER_MODIFIERS.has(token)) {
      if (pendingCase !== null) {
        return {
          password: "",
          valid: false,
          error: "Case modifier cannot precede a number. Please repeat those password characters.",
        };
      }
      expectDigit = true;
      continue;
    }

    // Handle active `number`/`digit` expectation
    if (expectDigit) {
      if (token === "double" && (PWD_FORCED_DIGIT_WORDS[next] || /^\d$/.test(next))) {
        const d = PWD_FORCED_DIGIT_WORDS[next] || next;
        password += d + d;
        expectDigit = false;
        i++;
        continue;
      }
      if (PWD_FORCED_DIGIT_WORDS[token]) {
        password += PWD_FORCED_DIGIT_WORDS[token];
        expectDigit = false;
        continue;
      }
      if (/^\d+$/.test(token)) {
        password += token;
        expectDigit = false;
        continue;
      }
      return {
        password: "",
        valid: false,
        error: "Expected a digit after number. Please repeat those password characters.",
      };
    }

    // Handle inline "the letter <X>" / "letter <X>" cleanly without breaking pendingCase
    if (!expectDigit) {
      const wrapperSkip = getInlineLetterPhraseSkip(tokens, i);
      if (wrapperSkip > 0) {
        i += wrapperSkip - 1;
        continue;
      }
      if (pendingCase === null && isConjunctionBeforeLetter(tokens, i, password.length > 0)) {
        continue;
      }
    }

    // Use shared ordinary letter decoder (checks two-word "double you" / "double u" + single letters)
    const letterDecoded = decodeOrdinaryLetterToken(token, next);
    if (letterDecoded && letterDecoded.consumed === 2) {
      password += pendingCase === "upper" ? "W" : "w";
      pendingCase = null;
      i++;
      continue;
    }

    // "double <digit>" without "number" prefix (only strict digits 0-9) or "double <letter>"
    if (token === "double" && next) {
      if (STRICT_SINGLE_DIGIT_MAP[next] || /^\d$/.test(next)) {
        if (pendingCase !== null) {
          return {
            password: "",
            valid: false,
            error: "Case modifier cannot apply to digits. Please repeat those password characters.",
          };
        }
        const d = STRICT_SINGLE_DIGIT_MAP[next] || next;
        password += d + d;
        i++;
        continue;
      }
      const doubledLetter = decodeOrdinaryLetterToken(next, next2);
      if (doubledLetter) {
        const ch =
          pendingCase === "upper"
            ? doubledLetter.letter.toUpperCase()
            : doubledLetter.letter.toLowerCase();
        password += ch + ch;
        pendingCase = null;
        i += doubledLetter.consumed;
        continue;
      }
    }

    // Single-word symbols (e.g. "at", "dot", "underscore", "hash")
    if (PWD_SINGLE_SYMBOLS[token]) {
      if (pendingCase !== null) {
        return {
          password: "",
          valid: false,
          error: "Case modifier cannot apply to symbols. Please repeat those password characters.",
        };
      }
      password += PWD_SINGLE_SYMBOLS[token];
      continue;
    }

    // Literal symbol characters
    if (LITERAL_SYMBOL_ONLY_RE.test(rawToken)) {
      if (pendingCase !== null) {
        return {
          password: "",
          valid: false,
          error: "Case modifier cannot apply to symbols.",
        };
      }
      password += rawToken;
      continue;
    }

    // Explicit digit words or numeric digits (0-9)
    if (STRICT_SINGLE_DIGIT_MAP[token] || /^\d+$/.test(token)) {
      if (pendingCase !== null) {
        return {
          password: "",
          valid: false,
          error: "Case modifier cannot apply to digits. Say number before digits.",
        };
      }
      password += STRICT_SINGLE_DIGIT_MAP[token] || token;
      continue;
    }

    // Shared ordinary alphabet letter recognition (default lowercase unless `capital` / `uppercase` preceded it)
    if (letterDecoded) {
      const ch = letterDecoded.letter;
      password += pendingCase === "upper" ? ch.toUpperCase() : ch.toLowerCase();
      pendingCase = null;
      continue;
    }

    // Reject ambiguous multi-letter words or unparsed fragments without guessing
    return {
      password: "",
      valid: false,
      error:
        "One or more characters were not recognised. Dictate using ordinary letters (say capital or small before letters), number before digits, and symbol names.",
    };
  }

  if (pendingCase !== null || expectDigit) {
    return {
      password: "",
      valid: false,
      error:
        "Incomplete password dictation: a modifier like capital or number had no character after it. Please repeat.",
    };
  }

  if (!password) {
    return {
      password: "",
      valid: false,
      error:
        "No valid password characters detected. Dictate using ordinary letters, numbers, and symbols.",
    };
  }

  return { password, valid: true, endRequested };
}
