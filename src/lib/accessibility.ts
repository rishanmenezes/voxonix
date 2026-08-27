export type AccessibilityProfile = "blind" | "deaf" | "non-speaking" | "standard";

export interface CommunicationPreferences {
  captionsEnabled: boolean;
  speechOutputEnabled: boolean;
  typeToSpeakEnabled: boolean;
  signRecognitionEnabled: boolean;
  gestureSafeFraming: boolean;
  highContrast: boolean;
  largeControls: boolean;
  reducedMotion: boolean;
}

export interface AccessibilityProfileInfo {
  id: AccessibilityProfile;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  modeDescription: string;
  description: string;
  icon: "Eye" | "Ear" | "MessageSquare" | "User";
  emoji: string;
  recommendedFocus: string;
  defaultPreferences: CommunicationPreferences;
}

export const STORAGE_KEY_PROFILE = "voxonix.accessibilityProfile";
export const STORAGE_KEY_PREFERENCES = "voxonix.communicationPreferences";

export const DEFAULT_PREFERENCES_BY_PROFILE: Record<AccessibilityProfile, CommunicationPreferences> = {
  blind: {
    captionsEnabled: true,
    speechOutputEnabled: true,
    typeToSpeakEnabled: false,
    signRecognitionEnabled: false,
    gestureSafeFraming: false,
    highContrast: true,
    largeControls: true,
    reducedMotion: false,
  },
  deaf: {
    captionsEnabled: true,
    speechOutputEnabled: false,
    typeToSpeakEnabled: false,
    signRecognitionEnabled: true,
    gestureSafeFraming: true,
    highContrast: false,
    largeControls: false,
    reducedMotion: false,
  },
  "non-speaking": {
    captionsEnabled: true,
    speechOutputEnabled: true,
    typeToSpeakEnabled: true,
    signRecognitionEnabled: false,
    gestureSafeFraming: false,
    highContrast: false,
    largeControls: false,
    reducedMotion: false,
  },
  standard: {
    captionsEnabled: true,
    speechOutputEnabled: false,
    typeToSpeakEnabled: false,
    signRecognitionEnabled: false,
    gestureSafeFraming: false,
    highContrast: false,
    largeControls: false,
    reducedMotion: false,
  },
};

export const ACCESSIBILITY_PROFILES: Record<AccessibilityProfile, AccessibilityProfileInfo> = {
  blind: {
    id: "blind",
    label: "Blind",
    shortLabel: "👁️ Blind",
    badgeLabel: "Blind • Audio focused",
    modeDescription: "Audio focused",
    description: "Speech output, acoustic feedback elimination, and voice/keyboard navigation",
    icon: "Eye",
    emoji: "👁️",
    recommendedFocus: "Speech output & voice settings",
    defaultPreferences: DEFAULT_PREFERENCES_BY_PROFILE.blind,
  },
  deaf: {
    id: "deaf",
    label: "Deaf",
    shortLabel: "👂 Deaf",
    badgeLabel: "Deaf • Visual focused",
    modeDescription: "Visual focused",
    description: "Real-time closed captions, ASL sign recognition, and gesture-safe video framing",
    icon: "Ear",
    emoji: "👂",
    recommendedFocus: "Live captions & sign recognition",
    defaultPreferences: DEFAULT_PREFERENCES_BY_PROFILE.deaf,
  },
  "non-speaking": {
    id: "non-speaking",
    label: "Non-speaking",
    shortLabel: "💬 Non-speaking",
    badgeLabel: "Non-speaking • Text focused",
    modeDescription: "Text focused",
    description: "Type-to-speak interface, quick customizable speech cards, and voice synthesis",
    icon: "MessageSquare",
    emoji: "💬",
    recommendedFocus: "Type-to-speak & quick responses",
    defaultPreferences: DEFAULT_PREFERENCES_BY_PROFILE["non-speaking"],
  },
  standard: {
    id: "standard",
    label: "Standard",
    shortLabel: "👤 Standard",
    badgeLabel: "Standard • Balanced",
    modeDescription: "Balanced",
    description: "Balanced multimodal communication with full access to all accessibility tools",
    icon: "User",
    emoji: "👤",
    recommendedFocus: "Live captions & communication settings",
    defaultPreferences: DEFAULT_PREFERENCES_BY_PROFILE.standard,
  },
};

export const ALL_PROFILES_LIST: AccessibilityProfileInfo[] = [
  ACCESSIBILITY_PROFILES.blind,
  ACCESSIBILITY_PROFILES.deaf,
  ACCESSIBILITY_PROFILES["non-speaking"],
  ACCESSIBILITY_PROFILES.standard,
];

/**
 * Safely normalizes any string or raw storage value into a valid AccessibilityProfile,
 * gracefully supporting legacy values ('mute', 'non-disabled').
 */
export function normalizeAccessibilityProfile(value: unknown): AccessibilityProfile | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (normalized === "blind") return "blind";
  if (normalized === "deaf") return "deaf";
  if (normalized === "non-speaking" || normalized === "nonspeaking" || normalized === "mute") {
    return "non-speaking";
  }
  if (normalized === "standard" || normalized === "non-disabled" || normalized === "nondisabled") {
    return "standard";
  }

  return null;
}

/**
 * Normalizes communication preferences, falling back to profile defaults or standard safe defaults.
 */
export function normalizeCommunicationPreferences(
  raw: unknown,
  profile?: AccessibilityProfile | null,
): CommunicationPreferences {
  const fallback = profile ? DEFAULT_PREFERENCES_BY_PROFILE[profile] : DEFAULT_PREFERENCES_BY_PROFILE.standard;
  if (!raw || typeof raw !== "object") return { ...fallback };

  const r = raw as Record<string, unknown>;
  return {
    captionsEnabled: typeof r.captionsEnabled === "boolean" ? r.captionsEnabled : fallback.captionsEnabled,
    speechOutputEnabled: typeof r.speechOutputEnabled === "boolean" ? r.speechOutputEnabled : fallback.speechOutputEnabled,
    typeToSpeakEnabled: typeof r.typeToSpeakEnabled === "boolean" ? r.typeToSpeakEnabled : fallback.typeToSpeakEnabled,
    signRecognitionEnabled: typeof r.signRecognitionEnabled === "boolean" ? r.signRecognitionEnabled : fallback.signRecognitionEnabled,
    gestureSafeFraming: typeof r.gestureSafeFraming === "boolean" ? r.gestureSafeFraming : fallback.gestureSafeFraming,
    highContrast: typeof r.highContrast === "boolean" ? r.highContrast : fallback.highContrast,
    largeControls: typeof r.largeControls === "boolean" ? r.largeControls : fallback.largeControls,
    reducedMotion: typeof r.reducedMotion === "boolean" ? r.reducedMotion : fallback.reducedMotion,
  };
}
