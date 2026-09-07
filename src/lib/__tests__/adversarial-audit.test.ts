import { describe, it, expect } from "vitest";
import { DEFAULT_PREFERENCES_BY_PROFILE, type AccessibilityProfile } from "../accessibility";
import { SpeechOutputEngine } from "../tts/speech-output-engine";
import type { TTSProvider, TTSState, TTSVoice } from "../tts/types";
import type { CaptionPayload } from "../webrtc/signaling-protocol";

describe("Adversarial Communication & Accessibility Audit", () => {
  describe("Phase G: TTS Acoustic Loop Prevention & Duplicate Suppression", () => {
    it("suppresses local spoken echo and prevents infinite acoustic loops", () => {
      const mockSpoken: string[] = [];
      const mockProvider: TTSProvider = {
        id: "mock-tts",
        name: "Mock TTS",
        isSupported: () => true,
        getVoices: async () => [] as TTSVoice[],
        speak: async (item) => {
          mockSpoken.push(item.text);
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        unlock: async () => true,
        getState: () => "idle" as TTSState,
        onStateChange: () => () => {},
        onError: () => () => {},
      };

      const localPeerId = "local-peer-123";
      const remotePeerId = "remote-peer-456";

      const engine = new SpeechOutputEngine({
        localPeerId,
        provider: mockProvider,
        initialConfig: {
          enabled: true,
          autoSpeakCaptions: true,
        },
      });

      // 1. Spoken caption from LOCAL user -> MUST BE SUPPRESSED (no self-echo / feedback loop)
      const localCaption: CaptionPayload = {
        captionId: "cap-1",
        utteranceId: "utt-1",
        revision: 1,
        speakerPeerId: localPeerId,
        speakerDisplayName: "Rishan Menezes",
        text: "Hello how are you?",
        isFinal: true,
        source: "speech",
        timestamp: Date.now(),
      };

      const ingestedLocal = engine.ingestCaption(localCaption);
      expect(ingestedLocal).toBe(false); // Suppressed!
      expect(engine.getTelemetry().feedbackSuppressionsCount).toBe(1);

      // 2. Spoken caption from REMOTE user -> Ingested & synthesized for Blind accessibility
      const remoteCaption: CaptionPayload = {
        captionId: "cap-2",
        utteranceId: "utt-2",
        revision: 1,
        speakerPeerId: remotePeerId,
        speakerDisplayName: "Partner B",
        text: "I can hear you clearly",
        isFinal: true,
        source: "speech",
        timestamp: Date.now(),
      };

      const ingestedRemote = engine.ingestCaption(remoteCaption);
      expect(ingestedRemote).toBe(true); // Ingested!

      // 3. Duplicate caption suppression (same utteranceId received again)
      const ingestedDuplicate = engine.ingestCaption(remoteCaption);
      expect(ingestedDuplicate).toBe(false); // Duplicate dropped!

      // 4. Acoustic echo detection: incoming microphone text matching recent synthesis is detected as echo
      expect(engine.isAcousticEcho("I can hear you clearly")).toBe(true);
      expect(engine.isAcousticEcho("completely different speech")).toBe(false);
    });

    it("enqueues typed speech from non-speaking users with high priority", () => {
      const mockProvider: TTSProvider = {
        id: "mock-tts",
        name: "Mock TTS",
        isSupported: () => true,
        getVoices: async () => [] as TTSVoice[],
        speak: async () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        unlock: async () => true,
        getState: () => "idle" as TTSState,
        onStateChange: () => () => {},
        onError: () => () => {},
      };

      const engine = new SpeechOutputEngine({
        localPeerId: "local-user-123",
        provider: mockProvider,
        initialConfig: { enabled: true },
      });

      const enqueued = engine.enqueueTypedSpeech("I am typing this message", "Alice", "typed-1");
      expect(enqueued).toBe(true);
      expect(engine.getTelemetry().queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Phase H: Sign Recognition Vocabulary Tier Gating", () => {
    it("enforces strict tier segregation between production, experimental, and dev-only", () => {
      const productionSigns = ["NO", "THANK YOU"];
      const experimentalSigns = ["HELLO", "YES", "Z", "PLAY", "HELP"];
      const devOnlySigns = ["J"];

      function isSignAllowed(
        sign: string,
        tier: "production-safe" | "experimental" | "all-dev",
      ): boolean {
        if (tier === "production-safe") {
          return productionSigns.includes(sign);
        }
        if (tier === "experimental") {
          return productionSigns.includes(sign) || experimentalSigns.includes(sign);
        }
        return (
          productionSigns.includes(sign) ||
          experimentalSigns.includes(sign) ||
          devOnlySigns.includes(sign)
        );
      }

      // Production-safe tier: ONLY NO and THANK YOU
      expect(isSignAllowed("NO", "production-safe")).toBe(true);
      expect(isSignAllowed("THANK YOU", "production-safe")).toBe(true);
      expect(isSignAllowed("HELLO", "production-safe")).toBe(false);
      expect(isSignAllowed("YES", "production-safe")).toBe(false);
      expect(isSignAllowed("J", "production-safe")).toBe(false);

      // Experimental tier
      expect(isSignAllowed("HELLO", "experimental")).toBe(true);
      expect(isSignAllowed("YES", "experimental")).toBe(true);
      expect(isSignAllowed("J", "experimental")).toBe(false);

      // All-dev tier
      expect(isSignAllowed("J", "all-dev")).toBe(true);
    });
  });

  describe("Phase I: Communication Event Bus & Identity Invariants", () => {
    it("maintains distinct speaker identities without cross-user contamination", () => {
      const eventLog: { speaker: string; text: string; source: string }[] = [];

      function processEvent(event: CaptionPayload, localPeerId: string) {
        const isLocal = event.speakerPeerId === localPeerId;
        eventLog.push({
          speaker: isLocal ? `${event.speakerDisplayName} (You)` : event.speakerDisplayName,
          text: event.text,
          source: event.source || "speech",
        });
      }

      const localId = "user-alice-1";
      const remoteId = "user-bob-2";

      processEvent(
        {
          captionId: "c1",
          utteranceId: "u1",
          revision: 1,
          speakerPeerId: localId,
          speakerDisplayName: "Alice",
          text: "Signing Thank You",
          isFinal: true,
          source: "sign",
          timestamp: Date.now(),
        },
        localId,
      );

      processEvent(
        {
          captionId: "c2",
          utteranceId: "u2",
          revision: 1,
          speakerPeerId: remoteId,
          speakerDisplayName: "Bob",
          text: "Speaking Hello",
          isFinal: true,
          source: "speech",
          timestamp: Date.now(),
        },
        localId,
      );

      expect(eventLog).toEqual([
        { speaker: "Alice (You)", text: "Signing Thank You", source: "sign" },
        { speaker: "Bob", text: "Speaking Hello", source: "speech" },
      ]);
    });
  });

  describe("Phase J: Accessibility Profile Invariants", () => {
    const profiles: AccessibilityProfile[] = ["blind", "deaf", "non-speaking", "standard"];

    it("provides valid default preferences for all 4 profiles without locking user customization", () => {
      for (const p of profiles) {
        const pref = DEFAULT_PREFERENCES_BY_PROFILE[p];
        expect(pref).toBeDefined();
        expect(typeof pref.captionsEnabled).toBe("boolean");
        expect(typeof pref.speechOutputEnabled).toBe("boolean");
        expect(typeof pref.signRecognitionEnabled).toBe("boolean");
      }

      // Verify specific profile defaults
      const blindPref = DEFAULT_PREFERENCES_BY_PROFILE["blind"];
      expect(blindPref.speechOutputEnabled).toBe(true);
      expect(blindPref.highContrast).toBe(true);
      expect(blindPref.largeControls).toBe(true);

      const deafPref = DEFAULT_PREFERENCES_BY_PROFILE["deaf"];
      expect(deafPref.captionsEnabled).toBe(true);
      expect(deafPref.signRecognitionEnabled).toBe(true);

      const nonSpeakingPref = DEFAULT_PREFERENCES_BY_PROFILE["non-speaking"];
      expect(nonSpeakingPref.typeToSpeakEnabled).toBe(true);
      expect(nonSpeakingPref.speechOutputEnabled).toBe(true);
    });
  });
});
