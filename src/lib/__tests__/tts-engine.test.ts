import { describe, it, expect, beforeEach, vi } from "vitest";
import { SpeechOutputEngine } from "../tts/speech-output-engine";
import type { TTSProvider, TTSState, TTSQueueItem, TTSConfig, TTSVoice } from "../tts/types";
import type { CaptionPayload } from "../webrtc/signaling-protocol";

class MockTTSProvider implements TTSProvider {
  public id = "mock-tts";
  public name = "Mock TTS Provider";
  public state: TTSState = "idle";
  public spokenItems: TTSQueueItem[] = [];
  private stateChangeListeners: ((state: TTSState) => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];

  public isSupported(): boolean {
    return true;
  }

  public getState(): TTSState {
    return this.state;
  }

  public async getVoices(): Promise<TTSVoice[]> {
    return [{ id: "voice-1", name: "Mock English", lang: "en-US", default: true }];
  }

  public async speak(item: TTSQueueItem, _config: TTSConfig): Promise<void> {
    this.state = "speaking";
    this.notifyState();
    this.spokenItems.push(item);
    this.state = "idle";
    this.notifyState();
  }

  public cancel(): void {
    this.state = "idle";
    this.notifyState();
  }

  public pause(): void {
    this.state = "paused";
    this.notifyState();
  }

  public resume(): void {
    this.state = "speaking";
    this.notifyState();
  }

  public async unlock(): Promise<boolean> {
    return true;
  }

  public onStateChange(callback: (state: TTSState) => void): () => void {
    this.stateChangeListeners.push(callback);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== callback);
    };
  }

  public onError(callback: (error: Error) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== callback);
    };
  }

  private notifyState(): void {
    this.stateChangeListeners.forEach((l) => l(this.state));
  }
}

describe("SpeechOutputEngine Invariants", () => {
  let mockProvider: MockTTSProvider;
  let engine: SpeechOutputEngine;

  beforeEach(() => {
    mockProvider = new MockTTSProvider();
    engine = new SpeechOutputEngine({
      localPeerId: "local-user-1",
      initialConfig: { enabled: true, autoSpeakCaptions: true },
      provider: mockProvider,
    });
  });

  it("filters out interim (non-final) captions", () => {
    const interimCaption: CaptionPayload = {
      captionId: "c1",
      utteranceId: "u1",
      revision: 1,
      speakerPeerId: "remote-user-2",
      speakerDisplayName: "Bob",
      text: "hello this is",
      isFinal: false,
      timestamp: Date.now(),
    };

    const ingested = engine.ingestCaption(interimCaption);
    expect(ingested).toBe(false);
    expect(mockProvider.spokenItems).toHaveLength(0);
  });

  it("prevents self-speech feedback loop by ignoring own captions", () => {
    const ownCaption: CaptionPayload = {
      captionId: "c2",
      utteranceId: "u2",
      revision: 1,
      speakerPeerId: "local-user-1", // Same as engine localPeerId
      speakerDisplayName: "Alice (Me)",
      text: "I am speaking right now.",
      isFinal: true,
      timestamp: Date.now(),
    };

    const ingested = engine.ingestCaption(ownCaption);
    expect(ingested).toBe(false);
    expect(engine.getTelemetry().feedbackSuppressionsCount).toBe(1);
    expect(mockProvider.spokenItems).toHaveLength(0);
  });

  it("ingests and synthesizes finalized remote captions", async () => {
    const remoteCaption: CaptionPayload = {
      captionId: "c3",
      utteranceId: "u3",
      revision: 1,
      speakerPeerId: "remote-user-2",
      speakerDisplayName: "Bob",
      text: "Hello from the remote side!",
      isFinal: true,
      timestamp: Date.now(),
    };

    const ingested = engine.ingestCaption(remoteCaption);
    expect(ingested).toBe(true);
    expect(mockProvider.spokenItems).toHaveLength(1);
    expect(mockProvider.spokenItems[0].text).toBe("Hello from the remote side!");
  });

  it("preempts and interrupts caption queue when user types speech", async () => {
    // Fill with background caption
    engine.ingestCaption({
      captionId: "c4",
      utteranceId: "u4",
      revision: 1,
      speakerPeerId: "remote-user-2",
      speakerDisplayName: "Bob",
      text: "Long story sentence.",
      isFinal: true,
      timestamp: Date.now(),
    });

    // Send urgent typed speech
    const queuedTyped = engine.enqueueTypedSpeech(
      "Excuse me, I have a question.",
      "Alice",
      "typed-1",
    );

    expect(queuedTyped).toBe(true);
    expect(mockProvider.spokenItems.some((i) => i.text === "Excuse me, I have a question.")).toBe(
      true,
    );
  });

  it("detects acoustic echo of recently spoken phrases", async () => {
    // Ingest speech
    engine.ingestCaption({
      captionId: "c5",
      utteranceId: "u5",
      revision: 1,
      speakerPeerId: "remote-user-2",
      speakerDisplayName: "Bob",
      text: "The weather in Seattle is rainy today",
      isFinal: true,
      timestamp: Date.now(),
    });

    // Test microphone transcript that mirrors the spoken sentence
    const isEcho = engine.isAcousticEcho("The weather in Seattle is rainy today");
    expect(isEcho).toBe(true);
    expect(engine.getTelemetry().acousticEchoSuppressionsCount).toBe(1);

    // Test distinct text that should not be classified as echo
    const notEcho = engine.isAcousticEcho("Let us review the financial budget");
    expect(notEcho).toBe(false);
  });
});
