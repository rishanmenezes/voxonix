/**
 * Central Capability Registry & Profile Authorization
 *
 * Enforces strict capability separation across the four primary profiles:
 * 1. Deaf / Hard of Hearing
 * 2. Non-speaking
 * 3. Blind / Low Vision
 * 4. Hearing & Speaking (Standard)
 */

export type PrimaryProfile = "deaf" | "non-speaking" | "blind" | "standard";

export const PRIMARY_PROFILES: readonly PrimaryProfile[] = [
  "deaf",
  "non-speaking",
  "blind",
  "standard",
] as const;

export type Capability =
  // Deaf profile capabilities
  | "live-captions"
  | "persistent-transcript"
  | "typed-messaging"
  | "sign-recognition"
  | "isl-reference"
  | "gesture-safe-framing"
  | "visual-notifications"
  // Non-speaking profile capabilities
  | "aac-board"
  | "phrase-favorites"
  | "custom-phrases"
  | "text-compose"
  | "type-to-speech"
  | "silent-send"
  // Blind / Low-Vision profile capabilities
  | "screen-reader-mode"
  | "voice-guided-navigation"
  | "speech-input"
  | "spoken-notifications"
  | "accessible-transcript"
  | "text-scaling"
  | "braille-compatible-output"
  // Standard profile capabilities
  | "audio-video-call"
  | "basic-chat"
  | "room-controls"
  | "participant-information";

export const PROFILE_CAPABILITIES: Record<PrimaryProfile, readonly Capability[]> = {
  deaf: [
    "live-captions",
    "persistent-transcript",
    "typed-messaging",
    "sign-recognition",
    "isl-reference",
    "gesture-safe-framing",
    "visual-notifications",
  ],
  "non-speaking": [
    "aac-board",
    "phrase-favorites",
    "custom-phrases",
    "text-compose",
    "type-to-speech",
    "silent-send",
  ],
  blind: [
    "screen-reader-mode",
    "voice-guided-navigation",
    "speech-input",
    "spoken-notifications",
    "accessible-transcript",
    "text-scaling",
    "braille-compatible-output",
  ],
  standard: ["audio-video-call", "basic-chat", "room-controls", "participant-information"],
} as const;

/**
 * Checks whether a given primary profile has authorization for a capability.
 */
export function hasCapability(profile: unknown, capability: Capability): boolean {
  if (typeof profile !== "string") return false;
  const normalized = profile.toLowerCase().trim() as PrimaryProfile;
  const allowed = PROFILE_CAPABILITIES[normalized];
  if (!allowed) return false;
  return allowed.includes(capability);
}

/**
 * Returns all authorized capabilities for a primary profile.
 */
export function getProfileCapabilities(profile: PrimaryProfile): readonly Capability[] {
  return PROFILE_CAPABILITIES[profile] || [];
}

/**
 * Asserts capability authorization; throws error if unauthorized.
 */
export function assertCapability(profile: PrimaryProfile, capability: Capability): void {
  if (!hasCapability(profile, capability)) {
    throw new Error(
      `Forbidden: Profile '${profile}' is not authorized to operate capability '${capability}'.`,
    );
  }
}

/**
 * Normalizes any string into a valid PrimaryProfile, defaulting to 'standard'.
 */
export function normalizePrimaryProfile(value: unknown): PrimaryProfile {
  if (typeof value !== "string") return "standard";
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (v === "deaf" || v === "hoh") return "deaf";
  if (v === "non-speaking" || v === "nonspeaking" || v === "mute" || v === "dumb") {
    return "non-speaking";
  }
  if (v === "blind" || v === "low-vision" || v === "lowvision") return "blind";
  return "standard";
}
