/**
 * Indian Sign Language (ISL) Type Definitions & Recognition Invariants.
 *
 * LINGUISTIC DISTINCTION:
 * - Indian Sign Language (ISL) is a distinct natural language with unique syntax and phonology.
 * - Unlike ASL (which is largely one-handed and derived from French Sign Language),
 *   ISL uses two-handed manual alphabets and extensive bimanual signs derived from BANZSL roots.
 * - Under no circumstances should ASL and ISL be conflated or substituted for one another.
 */

export const ISL_CLASSES_76 = [
  "afternoon",
  "animal",
  "bad",
  "beautiful",
  "big",
  "bird",
  "blind",
  "cat",
  "cheap",
  "clothing",
  "cold",
  "cow",
  "curved",
  "deaf",
  "dog",
  "dress",
  "dry",
  "evening",
  "expensive",
  "famous",
  "fast",
  "female",
  "fish",
  "flat",
  "friday",
  "good",
  "happy",
  "hat",
  "healthy",
  "horse",
  "hot",
  "hour",
  "light",
  "long",
  "loose",
  "loud",
  "minute",
  "monday",
  "month",
  "morning",
  "mouse",
  "narrow",
  "new",
  "night",
  "old",
  "pant",
  "pocket",
  "quiet",
  "sad",
  "saturday",
  "second",
  "shirt",
  "shoes",
  "short",
  "sick",
  "skirt",
  "slow",
  "small",
  "suit",
  "sunday",
  "t_shirt",
  "tall",
  "thursday",
  "time",
  "today",
  "tomorrow",
  "tuesday",
  "ugly",
  "warm",
  "wednesday",
  "week",
  "wet",
  "wide",
  "year",
  "yesterday",
  "young",
] as const;

export type ISLClassLabel = (typeof ISL_CLASSES_76)[number];

export type ISLSignCategory =
  | "time"
  | "greetings"
  | "adjectives"
  | "clothing"
  | "animals"
  | "states"
  | "alphabet";

export interface ISLSignEntry {
  id: string;
  englishGloss: string;
  hindiGloss?: string;
  category: ISLSignCategory;
  twoHanded: boolean;
  description: string;
  movementDescription: string;
  mnemonic: string;
}

export interface ISLRecognitionResult {
  label: string;
  confidence: number;
  isStable: boolean;
  isExperimental: true;
  backend: "local-mediapipe-temporal" | "remote-swin3d-service" | "offline-fallback";
  stableDurationMs: number;
  twoHanded: boolean;
  isRejectedUnknown: boolean;
}

export interface ISLAdapterConfig {
  enabled: boolean;
  minConfidence: number;
  stabilityThresholdMs: number;
  remoteServiceUrl?: string; // Optional local/remote Swin3D endpoint (e.g., http://localhost:5000)
}
