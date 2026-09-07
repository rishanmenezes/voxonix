import { describe, it, expect } from "vitest";
import {
  normalizeAccessibilityProfile,
  normalizeCommunicationPreferences,
  ACCESSIBILITY_PROFILES,
  ALL_PROFILES_LIST,
  DEFAULT_PREFERENCES_BY_PROFILE,
} from "../accessibility";

describe("Accessibility Invariants", () => {
  describe("normalizeAccessibilityProfile", () => {
    it("normalizes canonical profile strings correctly", () => {
      expect(normalizeAccessibilityProfile("deaf")).toBe("deaf");
      expect(normalizeAccessibilityProfile("blind")).toBe("blind");
      expect(normalizeAccessibilityProfile("non-speaking")).toBe("non-speaking");
      expect(normalizeAccessibilityProfile("standard")).toBe("standard");
    });

    it("normalizes legacy aliases case-insensitively and trims whitespace", () => {
      expect(normalizeAccessibilityProfile(" DEAF ")).toBe("deaf");
      expect(normalizeAccessibilityProfile("Blind")).toBe("blind");
      expect(normalizeAccessibilityProfile("MUTE\n")).toBe("non-speaking");
      expect(normalizeAccessibilityProfile("non_disabled")).toBe("standard");
    });

    it("falls back to null on null, undefined, or unknown strings", () => {
      expect(normalizeAccessibilityProfile(null)).toBeNull();
      expect(normalizeAccessibilityProfile(undefined)).toBeNull();
      expect(normalizeAccessibilityProfile("nonexistent-profile")).toBeNull();
      expect(normalizeAccessibilityProfile("")).toBeNull();
    });
  });

  describe("normalizeCommunicationPreferences", () => {
    it("returns default profile preferences when input is null or undefined", () => {
      const deafPrefs = normalizeCommunicationPreferences(null, "deaf");
      expect(deafPrefs.captionsEnabled).toBe(true);
      expect(deafPrefs.signRecognitionEnabled).toBe(true);

      const blindPrefs = normalizeCommunicationPreferences(undefined, "blind");
      expect(blindPrefs.speechOutputEnabled).toBe(true);
      expect(blindPrefs.captionsEnabled).toBe(true);

      const mutePrefs = normalizeCommunicationPreferences(null, "non-speaking");
      expect(mutePrefs.typeToSpeakEnabled).toBe(true);
    });

    it("preserves custom user preferences while filling missing fields with profile defaults", () => {
      const customDeaf = normalizeCommunicationPreferences(
        { captionsEnabled: false, highContrast: true },
        "deaf",
      );
      expect(customDeaf.captionsEnabled).toBe(false);
      expect(customDeaf.highContrast).toBe(true);
      expect(customDeaf.signRecognitionEnabled).toBe(true); // default filled
    });

    it("falls back to standard defaults when profile is null", () => {
      const standardPrefs = normalizeCommunicationPreferences(null, null);
      expect(standardPrefs).toEqual(DEFAULT_PREFERENCES_BY_PROFILE.standard);
    });
  });

  describe("ACCESSIBILITY_PROFILES Registry Integrity", () => {
    it("contains all canonical profile definitions with non-empty metadata", () => {
      const canonicalIds = ["deaf", "blind", "non-speaking", "standard"] as const;
      for (const id of canonicalIds) {
        const profile = ACCESSIBILITY_PROFILES[id];
        expect(profile).toBeDefined();
        expect(profile.id).toBe(id);
        expect(profile.label.length).toBeGreaterThan(0);
        expect(profile.description.length).toBeGreaterThan(0);
        expect(profile.defaultPreferences).toBeDefined();
      }
    });

    it("ALL_PROFILES_LIST contains exactly 4 canonical profiles", () => {
      expect(ALL_PROFILES_LIST).toHaveLength(4);
    });
  });
});
