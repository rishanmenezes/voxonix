/**
 * Non-Destructive Word Suggestion & Jitter Normalizer for Fingerspelling Sign Recognition.
 *
 * Core Invariant: User Input is King.
 * A user's recognized letter sequence is NEVER silently rewritten with a dictionary guess.
 * Suggestions are generated as non-destructive candidates that require user confirmation to apply.
 */

export interface WordSuggestion {
  original: string; // Exact, untampered signed string from user
  normalized: string; // Jitter-smoothed version (collapsing 3+ consecutive repeats to 2)
  suggested: string | null; // Recommended suggestion if candidate found, or null
  hasSuggestion: boolean; // True only if high-confidence suggestion exists and differs from original
  confidence: number; // 0.0 - 1.0 confidence score of the suggestion
  reason: "abbreviation" | "lexicon-match" | "stutter-dedup" | null;
}

// Essential conversational lexicon for video calls & ASL communication
const CORE_LEXICON: readonly string[] = [
  // Double-letter words (explicitly validated)
  "HELLO",
  "BOOK",
  "LETTER",
  "SUCCESS",
  "ADDRESS",
  "BALLOON",
  "MISS",
  "GOOD",
  "APPLE",
  "COFFEE",
  "SUMMER",
  "DINNER",
  "PIZZA",
  "HAPPY",
  "SORRY",
  "AGREE",
  "REPEAT",
  "CALL",
  "SEE",
  "LOOK",
  "FEEL",
  "SMALL",
  "ALL",
  "WILL",

  // Everyday conversational terms
  "HI",
  "HEY",
  "YES",
  "NO",
  "PLEASE",
  "THANK",
  "THANKS",
  "WELCOME",
  "BYE",
  "GOODBYE",
  "EXCUSE",
  "NAME",
  "NICE",
  "MEET",
  "YOU",
  "FINE",
  "BAD",
  "OKAY",
  "SURE",
  "MAYBE",
  "HELP",
  "KNOW",
  "THINK",
  "UNDERSTAND",
  "WANT",
  "NEED",
  "LIKE",
  "LOVE",
  "TELL",
  "TALK",
  "WORK",
  "PLAY",
  "READY",
  "DONE",
  "EASY",
  "HARD",
  "GREAT",
  "PERFECT",
  "COOL",
  "AWESOME",
  "WATER",
  "FOOD",
  "TIME",
  "TODAY",
  "NOW",
  "LATER",
  "SOON",
  "FRIEND",
  "FAMILY",
  "WHAT",
  "WHERE",
  "WHEN",
  "WHY",
  "HOW",
  "WHO",
  "VIDEO",
  "AUDIO",
  "CAMERA",
  "MIC",
  "SOUND",
  "MUTE",
  "UNMUTE",
  "HEAR",
  "SPEAK",
  "SIGN",
  "CHAT",
  "TEXT",
  "ROOM",
  "JOIN",
  "LEAVE",
  "START",
  "STOP",
  "SLOW",
  "AGAIN",
  "WAIT",
  "MOMENT",
  "MINUTE",
];

// Common ASL conversational and chat abbreviations
const ASL_ABBREVIATIONS: Record<string, string> = {
  THX: "THANKS",
  TY: "THANK YOU",
  PLS: "PLEASE",
  PLZ: "PLEASE",
  SRY: "SORRY",
  SMRY: "SORRY",
  IDK: "I DONT KNOW",
  NP: "NO PROBLEM",
  YW: "YOU ARE WELCOME",
  CU: "SEE YOU",
  GM: "GOOD MORNING",
  GN: "GOOD NIGHT",
  BRB: "BE RIGHT BACK",
  BTW: "BY THE WAY",
  OMG: "OH MY GOD",
  BC: "BECAUSE",
  W: "WITH",
  WO: "WITHOUT",
};

/**
 * EXPERIMENTAL DESIGN HEURISTIC: ASL Visual Confusion Pairs.
 *
 * NOTE: These pairs and their 0.5 distance discount are based on ASL handshape
 * geometric proximity from linguistic literature (e.g. Stokoe notation), NOT an
 * empirically fitted confusion matrix measured from a multi-signer test dataset.
 * They serve strictly as candidate ranking heuristics in the suggestion search,
 * and have NOT been validated across diverse human signers.
 */
const ASL_CONFUSION_PAIRS: ReadonlyArray<[string, string]> = [
  ["U", "V"], // 2 fingers extended: spread (V) vs closed (U)
  ["O", "C"], // Curved fingers: closed tips (O) vs open gap (C)
  ["A", "E"], // Fist with thumb on side (A) vs thumb tucked across (E)
  ["A", "S"], // Fist with thumb on side (A) vs thumb in front (S)
  ["D", "I"], // 1 extended finger: index (D) vs pinky (I)
  ["K", "P"], // Same handshape with downward wrist orientation (P)
  ["B", "D"], // Index extended with thumb loop (D) vs all 4 extended (B)
  ["M", "N"], // 3 fingers over thumb (M) vs 2 fingers over thumb (N)
];

/**
 * Normalizes sign hold jitter by collapsing runs of 3 or more identical consecutive characters
 * down to exactly 2 (the standard English maximum repeated letter, e.g. "LLLL" -> "LL", "OOO" -> "OO").
 *
 * CRITICAL INVARIANT: Natural double letters (e.g. LL in HELLO, OO in BOOK, PP in APPLE)
 * are NEVER stripped down to a single letter!
 */
export function normalizeStutterRuns(input: string): string {
  if (!input) return "";
  // Any run of 3 or more identical consecutive letters is smoothed to 2
  return input.replace(/(.)\1{2,}/gi, "$1$1");
}

/**
 * Computes an ASL-aware Damerau-Levenshtein distance between two strings,
 * applying discounted cost (0.5) for known ASL fingerspelling confusion pairs.
 */
export function aslWeightedDistance(source: string, target: string): number {
  const s = source.toUpperCase();
  const t = target.toUpperCase();
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  const isConfusionPair = (c1: string, c2: string): boolean => {
    return ASL_CONFUSION_PAIRS.some(([a, b]) => (a === c1 && b === c2) || (a === c2 && b === c1));
  };

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const charS = s[i - 1];
      const charT = t[j - 1];

      let cost = 1.0;
      if (charS === charT) {
        cost = 0;
      } else if (isConfusionPair(charS, charT)) {
        cost = 0.5; // Discounted cost for known visual confusion
      }

      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );

      // Transposition check (Damerau)
      if (i > 1 && j > 1 && charS === t[j - 2] && s[i - 2] === charT) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 0.8);
      }
    }
  }

  return d[m][n];
}

/**
 * Generates an optional word suggestion for a fingerspelled word.
 *
 * INVARIANT: Never overwrites the original word. The original signed word is always returned intact.
 * A suggestion is only provided if a high-confidence candidate is found and differs from the input.
 */
export function getWordSuggestion(
  rawWord: string,
  options?: {
    customLexicon?: string[];
    minConfidence?: number;
    maxEditDistance?: number;
  },
): WordSuggestion {
  const minConfidence = options?.minConfidence ?? 0.65;
  const maxAllowedDistance = options?.maxEditDistance ?? 2.0;

  const rawClean = rawWord.trim().toUpperCase();
  if (!rawClean) {
    return {
      original: rawWord,
      normalized: "",
      suggested: null,
      hasSuggestion: false,
      confidence: 1.0,
      reason: null,
    };
  }

  // 1. Smooth sensor jitter (3+ repeats collapsed to 2, e.g. "HELLLLO" -> "HELLO")
  const normalized = normalizeStutterRuns(rawClean);

  const lexicon = options?.customLexicon
    ? [...CORE_LEXICON, ...options.customLexicon]
    : CORE_LEXICON;
  const lexiconSet = new Set(lexicon);

  // 2. Exact match in vocabulary (including valid double-letter words)
  if (lexiconSet.has(rawClean)) {
    return {
      original: rawWord,
      normalized: rawClean,
      suggested: null, // No suggestion needed: word is already valid
      hasSuggestion: false,
      confidence: 1.0,
      reason: null,
    };
  }

  // 3. Jitter-smoothed word matches lexicon (e.g. raw "HELLLO" -> normalized "HELLO")
  if (normalized !== rawClean && lexiconSet.has(normalized)) {
    return {
      original: rawWord,
      normalized,
      suggested: normalized,
      hasSuggestion: true,
      confidence: 0.95,
      reason: "stutter-dedup",
    };
  }

  // 4. Known conversational abbreviation expansion (e.g. "THX" -> "THANKS")
  if (ASL_ABBREVIATIONS[normalized]) {
    return {
      original: rawWord,
      normalized,
      suggested: ASL_ABBREVIATIONS[normalized],
      hasSuggestion: true,
      confidence: 0.98,
      reason: "abbreviation",
    };
  }

  // 5. Lexicon distance search (with ASL confusion discounts)
  // For short words (length <= 4), only suggest if the distance is <= 0.5 (specifically an ASL visual confusion pair)
  // to prevent falsely matching names, acronyms, or loan words (e.g. CHEN, NASA, DEV, AMIGO).
  let bestCandidate: string | null = null;
  let lowestDist = Infinity;
  const maxDistForLength = normalized.length <= 4 ? 0.5 : Math.min(1.5, maxAllowedDistance);

  for (const word of lexicon) {
    if (Math.abs(word.length - normalized.length) > maxDistForLength) {
      continue;
    }

    const dist = aslWeightedDistance(normalized, word);
    if (dist < lowestDist) {
      lowestDist = dist;
      bestCandidate = word;
    }
  }

  if (bestCandidate && lowestDist <= maxDistForLength) {
    const score = Math.max(0, 1 - lowestDist / Math.max(normalized.length, 3));
    if (score >= minConfidence && bestCandidate !== rawClean) {
      return {
        original: rawWord,
        normalized,
        suggested: bestCandidate,
        hasSuggestion: true,
        confidence: Math.round(score * 100) / 100,
        reason: "lexicon-match",
      };
    }
  }

  // 6. Unknown word, proper noun, name, or acronym (no suggestion)
  return {
    original: rawWord,
    normalized,
    suggested: null,
    hasSuggestion: false,
    confidence: 1.0,
    reason: null,
  };
}
