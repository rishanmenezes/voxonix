import { describe, it, expect } from "vitest";
import type { SignalMessage, CaptionPayload } from "../webrtc/signaling-protocol";
import { MAX_PARTICIPANTS } from "../webrtc/config";

describe("WebRTC Signaling Protocol Invariants", () => {
  it("enforces the product's one-to-one room capacity", () => {
    expect(MAX_PARTICIPANTS).toBe(2);
  });
  it("serializes and deserializes join messages correctly", () => {
    const msg: SignalMessage = {
      type: "join",
      roomId: "ROOM-1234",
      peerId: "peer-abc",
      displayName: "Alice",
    };

    const serialized = JSON.stringify(msg);
    const parsed = JSON.parse(serialized) as SignalMessage;

    expect(parsed.type).toBe("join");
    if (parsed.type === "join") {
      expect(parsed.roomId).toBe("ROOM-1234");
      expect(parsed.peerId).toBe("peer-abc");
      expect(parsed.displayName).toBe("Alice");
    }
  });

  it("handles WebRTC offer/answer session descriptions", () => {
    const offerMsg: SignalMessage = {
      type: "offer",
      from: "peer-alice",
      to: "peer-bob",
      sdp: {
        type: "offer",
        sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
      },
    };

    const serialized = JSON.stringify(offerMsg);
    const parsed = JSON.parse(serialized) as SignalMessage;

    expect(parsed.type).toBe("offer");
    if (parsed.type === "offer") {
      expect(parsed.from).toBe("peer-alice");
      expect(parsed.to).toBe("peer-bob");
      expect(parsed.sdp.type).toBe("offer");
    }
  });

  it("handles real-time caption event payloads with metadata and timing", () => {
    const caption: CaptionPayload = {
      captionId: "cap-999",
      utteranceId: "utt-123",
      revision: 1,
      speakerPeerId: "peer-1",
      speakerDisplayName: "Bob",
      text: "Hello everyone, welcome to the call.",
      isFinal: true,
      timestamp: Date.now(),
      source: "speech",
      confidence: 0.96,
      localSTTTimings: {
        speechDetectionMs: 45,
        firstInterimMs: 120,
        finalResultMs: 250,
        totalRecognitionMs: 250,
      },
    };

    const msg: SignalMessage = {
      type: "caption",
      caption,
    };

    const serialized = JSON.stringify(msg);
    const parsed = JSON.parse(serialized) as SignalMessage;

    expect(parsed.type).toBe("caption");
    if (parsed.type === "caption") {
      expect(parsed.caption.text).toBe("Hello everyone, welcome to the call.");
      expect(parsed.caption.isFinal).toBe(true);
      expect(parsed.caption.source).toBe("speech");
      expect(parsed.caption.confidence).toBe(0.96);
      expect(parsed.caption.localSTTTimings?.finalResultMs).toBe(250);
    }
  });

  it("handles sign recognition gesture caption payloads", () => {
    const signCaption: CaptionPayload = {
      captionId: "sign-001",
      utteranceId: "utt-sign-1",
      revision: 1,
      speakerPeerId: "peer-sign",
      speakerDisplayName: "Signer Charlie",
      text: "THANK YOU",
      isFinal: true,
      timestamp: Date.now(),
      source: "sign",
      confidence: 0.92,
      metadata: {
        signHand: "Right",
        confidenceScore: 0.92,
        isGesture: true,
        rawLandmarkCount: 21,
      },
    };

    const msg: SignalMessage = {
      type: "caption",
      caption: signCaption,
    };

    const parsed = JSON.parse(JSON.stringify(msg)) as SignalMessage;
    if (parsed.type === "caption") {
      expect(parsed.caption.source).toBe("sign");
      expect(parsed.caption.metadata?.signHand).toBe("Right");
      expect(parsed.caption.metadata?.isGesture).toBe(true);
    }
  });
});
