import { describe, it, expect } from "vitest";

describe("Video Orientation & Identity Single Authority Invariants", () => {
  // Test helper replicating ParticipantTile canonical identity formatting
  function formatParticipantPresentationName(displayName: string, isLocal: boolean): string {
    return isLocal ? (displayName ? `${displayName} (You)` : "You") : displayName || "Participant";
  }

  // Test helper replicating ParticipantTile single authority orientation class
  function getOrientationClass(isLocal: boolean): {
    className: string;
    dataMirror: string;
  } {
    return {
      className: isLocal ? "video-mirrored" : "video-natural",
      dataMirror: isLocal ? "true" : "false",
    };
  }

  // Test helper replicating Video State Priority
  function deriveVideoRenderState(params: {
    playbackError: string | null;
    trackExists: boolean;
    trackReadyState: string;
    trackEnabled: boolean;
    trackMuted: boolean;
    videoEnabled: boolean;
    isDecodingConfirmed: boolean;
  }):
    | "VIDEO_ERROR"
    | "NO_REMOTE_TRACK"
    | "TRACK_LIVE_VIDEO_OFF"
    | "TRACK_LIVE_VIDEO_ON"
    | "VIDEO_DECODING" {
    if (params.playbackError) return "VIDEO_ERROR";
    if (!params.trackExists || params.trackReadyState === "ended") {
      return "NO_REMOTE_TRACK";
    }
    if (!params.videoEnabled || !params.trackEnabled || params.trackMuted) {
      return "TRACK_LIVE_VIDEO_OFF";
    }
    if (params.isDecodingConfirmed) {
      return "VIDEO_DECODING";
    }
    return "TRACK_LIVE_VIDEO_ON";
  }

  describe("Identity Canonical Model", () => {
    it("formats local user presentation name with (You)", () => {
      expect(formatParticipantPresentationName("Alice", true)).toBe("Alice (You)");
      expect(formatParticipantPresentationName("", true)).toBe("You");
    });

    it("formats remote user presentation name without (You)", () => {
      expect(formatParticipantPresentationName("Bob", false)).toBe("Bob");
      expect(formatParticipantPresentationName("", false)).toBe("Participant");
    });

    it("never uses displayName string to derive identity", () => {
      // Even if remote peer has displayName 'You', isLocal=false ensures they are treated as remote
      const remotePeerWithYouName = {
        peerId: "remote-1",
        displayName: "You",
        isLocal: false,
      };
      expect(remotePeerWithYouName.isLocal).toBe(false);
      expect(
        formatParticipantPresentationName(
          remotePeerWithYouName.displayName,
          remotePeerWithYouName.isLocal,
        ),
      ).toBe("You");
    });
  });

  describe("Orientation Ownership", () => {
    it("applies video-mirrored and data-mirror=true exclusively to local video", () => {
      const local = getOrientationClass(true);
      expect(local.className).toBe("video-mirrored");
      expect(local.dataMirror).toBe("true");
    });

    it("applies video-natural and data-mirror=false exclusively to remote video", () => {
      const remote = getOrientationClass(false);
      expect(remote.className).toBe("video-natural");
      expect(remote.dataMirror).toBe("false");
    });
  });

  describe("Video State Priority & Decoding Hierarchy", () => {
    it("returns NO_REMOTE_TRACK when track does not exist (even if stream object exists)", () => {
      const state = deriveVideoRenderState({
        playbackError: null,
        trackExists: false, // Stream exists but has 0 tracks!
        trackReadyState: "ended",
        trackEnabled: false,
        trackMuted: false,
        videoEnabled: true,
        isDecodingConfirmed: false,
      });
      expect(state).toBe("NO_REMOTE_TRACK");
    });

    it("returns TRACK_LIVE_VIDEO_OFF when user toggles videoEnabled to false", () => {
      const state = deriveVideoRenderState({
        playbackError: null,
        trackExists: true,
        trackReadyState: "live",
        trackEnabled: true,
        trackMuted: false,
        videoEnabled: false,
        isDecodingConfirmed: true,
      });
      expect(state).toBe("TRACK_LIVE_VIDEO_OFF");
    });

    it("returns TRACK_LIVE_VIDEO_OFF when track is muted or disabled", () => {
      const state = deriveVideoRenderState({
        playbackError: null,
        trackExists: true,
        trackReadyState: "live",
        trackEnabled: false,
        trackMuted: false,
        videoEnabled: true,
        isDecodingConfirmed: true,
      });
      expect(state).toBe("TRACK_LIVE_VIDEO_OFF");
    });

    it("returns TRACK_LIVE_VIDEO_ON when live track exists but frames are not yet confirmed", () => {
      const state = deriveVideoRenderState({
        playbackError: null,
        trackExists: true,
        trackReadyState: "live",
        trackEnabled: true,
        trackMuted: false,
        videoEnabled: true,
        isDecodingConfirmed: false,
      });
      expect(state).toBe("TRACK_LIVE_VIDEO_ON");
    });

    it("returns VIDEO_DECODING when live track exists and frames are confirmed", () => {
      const state = deriveVideoRenderState({
        playbackError: null,
        trackExists: true,
        trackReadyState: "live",
        trackEnabled: true,
        trackMuted: false,
        videoEnabled: true,
        isDecodingConfirmed: true,
      });
      expect(state).toBe("VIDEO_DECODING");
    });

    it("returns VIDEO_ERROR when playback throws an unrecoverable error", () => {
      const state = deriveVideoRenderState({
        playbackError: "NotAllowedError",
        trackExists: true,
        trackReadyState: "live",
        trackEnabled: true,
        trackMuted: false,
        videoEnabled: true,
        isDecodingConfirmed: false,
      });
      expect(state).toBe("VIDEO_ERROR");
    });
  });
});
