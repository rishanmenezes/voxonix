import { describe, it, expect, vi, beforeEach } from "vitest";
import { STTFallbackStateMachine, type STTSystemState } from "../stt/stt-fallback-state-machine";
import type { SignalingBroker } from "../../lib/webrtc/signaling";

describe("STT Fallback State Machine Invariants", () => {
  let mockSignaling: Partial<SignalingBroker>;
  let stateHistory: STTSystemState[];
  let stateMachine: STTFallbackStateMachine;

  beforeEach(() => {
    stateHistory = [];
    mockSignaling = {
      setCallbacks: vi.fn(),
      broadcastCaption: vi.fn(),
      broadcastMediaState: vi.fn(),
    };

    stateMachine = new STTFallbackStateMachine({
      signaling: mockSignaling as SignalingBroker,
      getAudioTrack: () => null,
      onTranscript: vi.fn(),
      onStateChange: (st) => stateHistory.push(st),
    });
  });

  it("starts in DISABLED state", () => {
    expect(stateMachine.getSystemState()).toBe("DISABLED");
  });

  it("transitions to DISABLED when shouldListen is set to false", async () => {
    await stateMachine.setShouldListen(false);
    expect(stateMachine.getSystemState()).toBe("DISABLED");
  });

  it("guarantees activeProvider is null when fully stopped", async () => {
    await stateMachine.stopAll();
    expect(stateMachine.getActiveProvider()).toBeNull();
  });
});
