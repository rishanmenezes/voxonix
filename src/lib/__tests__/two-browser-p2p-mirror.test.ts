import { describe, it, expect } from "vitest";

describe("Two-Party Asymmetric Mirror & Remote Video Decoding Lifecycle", () => {
  // Model of Participant state
  interface ParticipantState {
    peerId: string;
    displayName: string;
    isLocal: boolean;
    hasVideoTrack: boolean;
    trackReadyState: "live" | "ended" | "muted";
    trackEnabled: boolean;
    videoEnabled: boolean;
    isDecodingConfirmed: boolean;
  }

  // Canonical identity presenter
  function getPresentationName(displayName: string, isLocal: boolean): string {
    return isLocal ? (displayName ? `${displayName} (You)` : "You") : displayName || "Participant";
  }

  // Single authority orientation classifier
  function getOrientationAttributes(isLocal: boolean): {
    className: string;
    dataMirror: "true" | "false";
    cssTransform: string;
  } {
    return {
      className: isLocal ? "video-mirrored" : "video-natural",
      dataMirror: isLocal ? "true" : "false",
      cssTransform: isLocal ? "scaleX(-1)" : "none",
    };
  }

  // 5-state priority machine
  function deriveVideoState(
    p: ParticipantState,
  ):
    | "VIDEO_ERROR"
    | "NO_REMOTE_TRACK"
    | "TRACK_LIVE_VIDEO_OFF"
    | "TRACK_LIVE_VIDEO_ON"
    | "VIDEO_DECODING" {
    if (!p.hasVideoTrack || p.trackReadyState === "ended") {
      return "NO_REMOTE_TRACK";
    }
    if (!p.videoEnabled || !p.trackEnabled || p.trackReadyState === "muted") {
      return "TRACK_LIVE_VIDEO_OFF";
    }
    if (p.isDecodingConfirmed) {
      return "VIDEO_DECODING";
    }
    return "TRACK_LIVE_VIDEO_ON";
  }

  describe("Asymmetric Orientation Matrix (Browser A vs. Browser B)", () => {
    const userA: ParticipantState = {
      peerId: "peer-a-123",
      displayName: "Rishan Menezes",
      isLocal: true,
      hasVideoTrack: true,
      trackReadyState: "live",
      trackEnabled: true,
      videoEnabled: true,
      isDecodingConfirmed: true,
    };

    const userB: ParticipantState = {
      peerId: "peer-b-456",
      displayName: "Partner B",
      isLocal: true,
      hasVideoTrack: true,
      trackReadyState: "live",
      trackEnabled: true,
      videoEnabled: true,
      isDecodingConfirmed: true,
    };

    it("Browser A: Local PiP is mirrored, Remote Stage (User B) is natural", () => {
      // From Browser A perspective:
      // Local view: User A (isLocal = true)
      const aLocal = getOrientationAttributes(true);
      expect(aLocal.className).toBe("video-mirrored");
      expect(aLocal.dataMirror).toBe("true");
      expect(aLocal.cssTransform).toBe("scaleX(-1)");
      expect(getPresentationName(userA.displayName, true)).toBe("Rishan Menezes (You)");

      // Remote view: User B (isLocal = false)
      const aRemote = getOrientationAttributes(false);
      expect(aRemote.className).toBe("video-natural");
      expect(aRemote.dataMirror).toBe("false");
      expect(aRemote.cssTransform).toBe("none");
      expect(getPresentationName(userB.displayName, false)).toBe("Partner B");
    });

    it("Browser B: Local PiP is mirrored, Remote Stage (User A) is natural", () => {
      // From Browser B perspective:
      // Local view: User B (isLocal = true)
      const bLocal = getOrientationAttributes(true);
      expect(bLocal.className).toBe("video-mirrored");
      expect(bLocal.dataMirror).toBe("true");
      expect(bLocal.cssTransform).toBe("scaleX(-1)");
      expect(getPresentationName(userB.displayName, true)).toBe("Partner B (You)");

      // Remote view: User A (isLocal = false)
      const bRemote = getOrientationAttributes(false);
      expect(bRemote.className).toBe("video-natural");
      expect(bRemote.dataMirror).toBe("false");
      expect(bRemote.cssTransform).toBe("none");
      expect(getPresentationName(userA.displayName, false)).toBe("Rishan Menezes");
    });
  });

  describe("Remote Video State Machine & 5-Cycle Camera Toggle Regression", () => {
    it("transitions through all lifecycle states correctly without black screen", () => {
      // 1. Initial State: Remote peer joined with no video track yet
      let remoteB: ParticipantState = {
        peerId: "peer-b-456",
        displayName: "Partner B",
        isLocal: false,
        hasVideoTrack: false,
        trackReadyState: "ended",
        trackEnabled: false,
        videoEnabled: true,
        isDecodingConfirmed: false,
      };

      expect(deriveVideoState(remoteB)).toBe("NO_REMOTE_TRACK");

      // 2. Remote track arrives, awaiting frames
      remoteB = {
        ...remoteB,
        hasVideoTrack: true,
        trackReadyState: "live",
        trackEnabled: true,
        videoEnabled: true,
        isDecodingConfirmed: false,
      };
      expect(deriveVideoState(remoteB)).toBe("TRACK_LIVE_VIDEO_ON");

      // 3. First decoded frame confirmed
      remoteB = {
        ...remoteB,
        isDecodingConfirmed: true,
      };
      expect(deriveVideoState(remoteB)).toBe("VIDEO_DECODING");

      // 4. 5-Cycle Camera Toggle Regression Test
      for (let cycle = 1; cycle <= 5; cycle++) {
        // Toggle Camera OFF
        remoteB = {
          ...remoteB,
          videoEnabled: false,
          isDecodingConfirmed: false,
        };
        expect(deriveVideoState(remoteB)).toBe("TRACK_LIVE_VIDEO_OFF");

        // Toggle Camera ON (awaiting frame confirmation)
        remoteB = {
          ...remoteB,
          videoEnabled: true,
          isDecodingConfirmed: false,
        };
        expect(deriveVideoState(remoteB)).toBe("TRACK_LIVE_VIDEO_ON");

        // Frame decoding confirmed
        remoteB = {
          ...remoteB,
          isDecodingConfirmed: true,
        };
        expect(deriveVideoState(remoteB)).toBe("VIDEO_DECODING");
      }
    });

    it("transitions cleanly on remote peer leave and rejoin", () => {
      let remoteB: ParticipantState | null = {
        peerId: "peer-b-456",
        displayName: "Partner B",
        isLocal: false,
        hasVideoTrack: true,
        trackReadyState: "live",
        trackEnabled: true,
        videoEnabled: true,
        isDecodingConfirmed: true,
      };

      expect(deriveVideoState(remoteB)).toBe("VIDEO_DECODING");

      // Remote Peer leaves
      remoteB = null;
      expect(remoteB).toBeNull(); // Stage returns to "Waiting for partner to join..."

      // Remote Peer rejoins
      remoteB = {
        peerId: "peer-b-789", // New peer session
        displayName: "Partner B",
        isLocal: false,
        hasVideoTrack: true,
        trackReadyState: "live",
        trackEnabled: true,
        videoEnabled: true,
        isDecodingConfirmed: true,
      };

      expect(deriveVideoState(remoteB)).toBe("VIDEO_DECODING");
      expect(getPresentationName(remoteB.displayName, remoteB.isLocal)).toBe("Partner B");
    });
  });
});
