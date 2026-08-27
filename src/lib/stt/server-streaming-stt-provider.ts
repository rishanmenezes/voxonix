import type {
  STTProvider,
  STTConfig,
  STTState,
  TranscriptResult,
  STTTelemetry,
  STTLifecycleTimings,
  STTSegmentLatency,
  AudioStreamingStats,
} from "./types";
import type { SignalingBroker } from "@/lib/webrtc/signaling";

export function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const candidate of candidates) {
    if (
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }
  return "audio/webm";
}

export class ServerStreamingSTTProvider implements STTProvider {
  public readonly id = "server-streaming-deepgram";
  public readonly name = "Server-Mediated Streaming STT (Deepgram Nova-3)";

  private static activeInstances = 0;

  private mediaRecorder: MediaRecorder | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private state: STTState = "idle";
  private intendedState: "idle" | "listening" = "idle";

  private currentUtteranceId = "";
  private currentRevision = 0;
  private chunkIndex = 0;
  private lastChunkTime = 0;
  private chunkArrivalIntervals: number[] = [];
  private negotiatedMimeType = "audio/webm";

  // Telemetry
  private restartCount = 0;
  private errorCounts: Record<string, number> = {};
  private utteranceCount = 0;
  private wordsCount = 0;
  private timings: STTLifecycleTimings = { subsequentInterimsCount: 0 };
  private metrics: STTSegmentLatency = {};
  private streamingStats: AudioStreamingStats = {};

  private transcriptListeners = new Set<(result: TranscriptResult) => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private stateListeners = new Set<(state: STTState) => void>();
  private telemetryListeners = new Set<(telemetry: STTTelemetry) => void>();

  private config: STTConfig = {
    language: "en-US",
    continuous: true,
    interimResults: true,
  };

  constructor(
    private readonly signaling: SignalingBroker,
    private readonly getAudioTrack: () => MediaStreamTrack | null,
  ) {
    this.setupSignalingListeners();
  }

  private setupSignalingListeners() {
    // Listen for STT state transitions and captions from server
    this.signaling.setCallbacks({
      onSTTState: (data) => {
        if (data.state === "active") {
          this.setState("listening");
        } else if (data.state === "reconnecting") {
          this.setState("paused");
        } else if (data.state === "failed") {
          this.errorCounts["server-failure"] = (this.errorCounts["server-failure"] || 0) + 1;
          this.setState("error");
          this.errorListeners.forEach((cb) => cb(new Error(data.message || "Server STT error")));
        } else if (data.state === "closed") {
          this.setState("idle");
        }
      },
      onCaption: (caption) => {
        // If this caption belongs to the local speaker, record local timings and notify local listeners
        if (caption.speakerPeerId === this.signaling.getPeerId()) {
          this.currentUtteranceId = caption.utteranceId;
          this.currentRevision = caption.revision;

          const now = performance.now();
          if (!caption.isFinal) {
            if (!this.timings.firstInterimMs) {
              this.timings.firstInterimMs = now;
              this.metrics.firstInterimLatencyMs = Math.max(
                0,
                now - (this.timings.onSpeechStartMs || this.timings.onAudioStartMs || now),
              );
            } else {
              this.timings.subsequentInterimsCount++;
              this.timings.lastInterimMs = now;
            }
          } else {
            this.timings.finalResultMs = now;
            this.metrics.finalResultLatencyMs = Math.max(
              0,
              now - (this.timings.firstInterimMs || this.timings.onAudioStartMs || now),
            );
            this.metrics.totalRecognitionLatencyMs = Math.max(
              0,
              now - (this.timings.onAudioStartMs || now),
            );
            this.utteranceCount++;
            this.wordsCount += caption.text.split(/\s+/).filter(Boolean).length;
          }

          const result: TranscriptResult = {
            utteranceId: caption.utteranceId,
            revision: caption.revision,
            text: caption.text,
            isFinal: caption.isFinal,
            confidence: 0.99,
            timings: { ...this.metrics },
          };

          this.transcriptListeners.forEach((cb) => cb(result));
          this.notifyTelemetry();

          if (caption.isFinal) {
            this.timings.firstInterimMs = undefined;
            this.timings.subsequentInterimsCount = 0;
            this.timings.onSpeechStartMs = undefined;
          }
        }
      },
    });
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
  }

  public getState(): STTState {
    return this.state;
  }

  public getTelemetry(): STTTelemetry {
    return {
      providerId: this.id,
      providerName: this.name,
      isSupported: this.isSupported(),
      activeInstancesCount: ServerStreamingSTTProvider.activeInstances,
      restartCount: this.restartCount,
      errorCounts: { ...this.errorCounts },
      latestTimings: { ...this.timings },
      latestMetrics: { ...this.metrics },
      streamingStats: { ...this.streamingStats },
      recentUtteranceCount: this.utteranceCount,
      recentWordsCount: this.wordsCount,
    };
  }

  private notifyTelemetry() {
    const telemetry = this.getTelemetry();
    this.telemetryListeners.forEach((cb) => {
      try {
        cb(telemetry);
      } catch (err) {
        console.warn("[ServerStreamingSTT] Telemetry callback error:", err);
      }
    });
  }

  private setState(newState: STTState) {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((cb) => {
      try {
        cb(newState);
      } catch (err) {
        console.warn("[ServerStreamingSTT] State listener error:", err);
      }
    });
    this.notifyTelemetry();
  }

  public async start(config?: STTConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.intendedState = "listening";
    this.timings.startCalledMs = performance.now();

    const track = this.getAudioTrack();
    if (!track || track.readyState !== "live") {
      console.warn("[ServerStreamingSTT] No live audio track available to record.");
      this.setState("paused");
      return;
    }

    this.audioTrack = track;
    this.negotiatedMimeType = getSupportedAudioMimeType();

    try {
      if (this.mediaRecorder) {
        try {
          this.mediaRecorder.ondataavailable = null;
          this.mediaRecorder.onerror = null;
          this.mediaRecorder.onstop = null;
          if (this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
          }
        } catch {
          // ignore
        }
        if (ServerStreamingSTTProvider.activeInstances > 0) {
          ServerStreamingSTTProvider.activeInstances--;
        }
        this.mediaRecorder = null;
      }

      // Notify server to open Deepgram streaming session
      this.signaling.sendSTTStart(this.negotiatedMimeType, this.config.language || "en-US");

      const stream = new MediaStream([track]);
      const recorder = new MediaRecorder(stream, { mimeType: this.negotiatedMimeType });
      ServerStreamingSTTProvider.activeInstances++;

      this.chunkIndex = 0;
      this.chunkArrivalIntervals = [];
      this.lastChunkTime = performance.now();
      this.timings.onAudioStartMs = performance.now();

      recorder.ondataavailable = async (event) => {
        if (this.intendedState !== "listening" || !event.data || event.data.size === 0) {
          return;
        }

        const now = performance.now();
        const arrivalIntervalMs = Math.max(0, Math.round(now - this.lastChunkTime));
        this.lastChunkTime = now;

        // Track chunk arrival interval metrics (rolling 20 samples)
        this.chunkArrivalIntervals.push(arrivalIntervalMs);
        if (this.chunkArrivalIntervals.length > 20) {
          this.chunkArrivalIntervals.shift();
        }
        const avgInterval = Math.round(
          this.chunkArrivalIntervals.reduce((a, b) => a + b, 0) / this.chunkArrivalIntervals.length,
        );

        const chunkSize = event.data.size;
        this.streamingStats = {
          negotiatedMimeType: this.negotiatedMimeType,
          lastChunkDurationMs: arrivalIntervalMs,
          lastChunkArrivalIntervalMs: arrivalIntervalMs,
          lastChunkByteLength: chunkSize,
          avgChunkArrivalIntervalMs: avgInterval,
          totalChunksStreamed: this.chunkIndex + 1,
        };

        try {
          const arrayBuffer = await event.data.arrayBuffer();
          // Direct binary frame transport (zero base64 allocation overhead)
          this.signaling.sendSTTAudioBinary(arrayBuffer);
          this.chunkIndex++;
          this.notifyTelemetry();
        } catch (err) {
          console.warn("[ServerStreamingSTT] Error sending binary audio chunk:", err);
        }
      };

      recorder.onerror = (err) => {
        console.warn("[ServerStreamingSTT] MediaRecorder error:", err);
        this.errorCounts["recorder-error"] = (this.errorCounts["recorder-error"] || 0) + 1;
        this.notifyTelemetry();
      };

      recorder.onstop = () => {
        if (ServerStreamingSTTProvider.activeInstances > 0) {
          ServerStreamingSTTProvider.activeInstances--;
        }
      };

      this.mediaRecorder = recorder;
      // Target 80ms chunks for optimal Deepgram streaming performance
      recorder.start(80);

      this.timings.onStartMs = performance.now();
      this.metrics.serviceInitLatencyMs = Math.max(
        0,
        this.timings.onStartMs - this.timings.startCalledMs,
      );
      this.setState("listening");
    } catch (err) {
      console.warn("[ServerStreamingSTT] Failed to start MediaRecorder:", err);
      this.errorCounts["start-exception"] = (this.errorCounts["start-exception"] || 0) + 1;
      this.setState("error");
    }
  }

  public async stop(): Promise<void> {
    this.intendedState = "idle";

    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onerror = null;
        if (this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        }
      } catch {
        // ignore
      }
      if (ServerStreamingSTTProvider.activeInstances > 0) {
        ServerStreamingSTTProvider.activeInstances--;
      }
      this.mediaRecorder = null;
    }

    // Inform server to terminate the Deepgram session
    this.signaling.sendSTTStop();
    this.setState("idle");
  }

  public onTranscript(cb: (result: TranscriptResult) => void): () => void {
    this.transcriptListeners.add(cb);
    return () => this.transcriptListeners.delete(cb);
  }

  public onError(cb: (error: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  public onStateChange(cb: (state: STTState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public onTelemetry(cb: (telemetry: STTTelemetry) => void): () => void {
    this.telemetryListeners.add(cb);
    cb(this.getTelemetry());
    return () => this.telemetryListeners.delete(cb);
  }
}
