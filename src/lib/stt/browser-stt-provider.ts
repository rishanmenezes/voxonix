import type {
  STTProvider,
  STTConfig,
  STTState,
  TranscriptResult,
  STTTelemetry,
  STTLifecycleTimings,
  STTSegmentLatency,
} from "./types";

interface ISpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface ISpeechRecognitionResult {
  readonly length: number;
  [index: number]: ISpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface ISpeechRecognitionResultList {
  readonly length: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}

interface ISpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundend: (() => void) | null;
  onaudioend: (() => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognitionInstance;

interface IWindowSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export class BrowserSpeechRecognitionProvider implements STTProvider {
  public readonly id = "browser-web-speech";
  public readonly name = "Browser Web Speech API";

  // Global static tracking for active recognizers across the window
  private static activeInstances = 0;

  private recognition: ISpeechRecognitionInstance | null = null;
  private state: STTState = "idle";
  private intendedState: "idle" | "listening" = "idle";
  private currentGenerationId = 0;

  private currentUtteranceId = "";
  private currentRevision = 0;

  // Telemetry & Timing State
  private lastErrorCode = "";
  private restartCount = 0;
  private errorCounts: Record<string, number> = {};
  private utteranceCount = 0;
  private wordsCount = 0;

  private timings: STTLifecycleTimings = {
    subsequentInterimsCount: 0,
  };

  private metrics: STTSegmentLatency = {};

  private transcriptListeners: Set<(result: TranscriptResult) => void> = new Set();
  private errorListeners: Set<(error: Error) => void> = new Set();
  private stateListeners: Set<(state: STTState) => void> = new Set();
  private telemetryListeners: Set<(telemetry: STTTelemetry) => void> = new Set();

  private config: STTConfig = {
    language: "en-US",
    continuous: true,
    interimResults: true,
  };

  public isSupported(): boolean {
    if (typeof window === "undefined") return false;
    const win = window as unknown as IWindowSpeechRecognition;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public getState(): STTState {
    return this.state;
  }

  public getTelemetry(): STTTelemetry {
    return {
      providerId: this.id,
      providerName: this.name,
      isSupported: this.isSupported(),
      activeInstancesCount: BrowserSpeechRecognitionProvider.activeInstances,
      restartCount: this.restartCount,
      errorCounts: { ...this.errorCounts },
      latestTimings: { ...this.timings },
      latestMetrics: { ...this.metrics },
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
        console.warn("[BrowserSTT] Telemetry callback error:", err);
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
        console.warn("[BrowserSTT] State listener error:", err);
      }
    });
    this.notifyTelemetry();
  }

  public async start(config?: STTConfig): Promise<void> {
    if (!this.isSupported()) {
      this.setState("unsupported");
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.intendedState = "listening";
    this.currentGenerationId++;
    const activeGen = this.currentGenerationId;

    this.timings.startCalledMs = performance.now();
    this.initRecognition(activeGen);
  }

  public async stop(): Promise<void> {
    this.intendedState = "idle";
    this.currentGenerationId++;

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort errors on stopped instances
      }
      if (BrowserSpeechRecognitionProvider.activeInstances > 0) {
        BrowserSpeechRecognitionProvider.activeInstances--;
      }
      this.recognition = null;
    }

    this.setState("idle");
  }

  private initRecognition(genId: number): void {
    if (genId !== this.currentGenerationId || this.intendedState !== "listening") {
      return;
    }

    const win = window as unknown as IWindowSpeechRecognition;
    const SpeechRecognitionConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      this.setState("unsupported");
      return;
    }

    try {
      if (this.recognition) {
        try {
          this.recognition.abort();
        } catch {
          // ignore
        }
        if (BrowserSpeechRecognitionProvider.activeInstances > 0) {
          BrowserSpeechRecognitionProvider.activeInstances--;
        }
        this.recognition = null;
      }

      const rec = new SpeechRecognitionConstructor();
      BrowserSpeechRecognitionProvider.activeInstances++;

      rec.continuous = this.config.continuous !== false;
      rec.interimResults = this.config.interimResults !== false;
      rec.lang = this.config.language || "en-US";
      rec.maxAlternatives = 1;

      this.currentUtteranceId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.currentRevision = 0;

      // Reset timings for this session
      this.timings = {
        startCalledMs: performance.now(),
        subsequentInterimsCount: 0,
      };

      // 1. onstart — Recognition service has begun listening
      rec.onstart = () => {
        if (genId !== this.currentGenerationId || this.intendedState !== "listening") return;
        const now = performance.now();
        this.timings.onStartMs = now;
        if (this.timings.startCalledMs) {
          this.metrics.serviceInitLatencyMs = Math.max(0, now - this.timings.startCalledMs);
        }
        this.setState("listening");
      };

      // 2. onaudiostart — User agent started audio capture
      rec.onaudiostart = () => {
        if (genId !== this.currentGenerationId) return;
        this.timings.onAudioStartMs = performance.now();
        this.notifyTelemetry();
      };

      // 3. onsoundstart — Sound detected in audio stream
      rec.onsoundstart = () => {
        if (genId !== this.currentGenerationId) return;
        this.timings.onSoundStartMs = performance.now();
        this.notifyTelemetry();
      };

      // 4. onspeechstart — Speech recognized by the service
      rec.onspeechstart = () => {
        if (genId !== this.currentGenerationId) return;
        const now = performance.now();
        this.timings.onSpeechStartMs = now;
        if (this.timings.onAudioStartMs) {
          this.metrics.speechDetectionLatencyMs = Math.max(0, now - this.timings.onAudioStartMs);
        }
        this.notifyTelemetry();
      };

      // 5. onresult — Incoming transcription results (interim / final)
      rec.onresult = (event: ISpeechRecognitionEvent) => {
        if (genId !== this.currentGenerationId || this.intendedState !== "listening") {
          return;
        }

        const now = performance.now();

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim();
          if (!text) continue;

          const isFinal = !!res.isFinal;
          this.currentRevision++;

          // Latency Instrumentation
          const speechStartRef =
            this.timings.onSpeechStartMs ||
            this.timings.onAudioStartMs ||
            this.timings.onStartMs ||
            now;

          if (!isFinal) {
            if (!this.timings.firstInterimMs) {
              this.timings.firstInterimMs = now;
              this.metrics.firstInterimLatencyMs = Math.max(0, now - speechStartRef);
            } else {
              this.timings.subsequentInterimsCount++;
              this.timings.lastInterimMs = now;
            }
          } else {
            this.timings.finalResultMs = now;
            this.metrics.finalResultLatencyMs = Math.max(
              0,
              now - (this.timings.onSpeechEndMs || this.timings.firstInterimMs || speechStartRef),
            );
            this.metrics.totalRecognitionLatencyMs = Math.max(0, now - speechStartRef);

            this.utteranceCount++;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            this.wordsCount += wordCount;
          }

          const transcriptItem: TranscriptResult = {
            utteranceId: this.currentUtteranceId,
            revision: this.currentRevision,
            text,
            isFinal,
            confidence: res[0]?.confidence,
            timings: { ...this.metrics },
          };

          this.transcriptListeners.forEach((cb) => {
            try {
              cb(transcriptItem);
            } catch (err) {
              console.warn("[BrowserSTT] Transcript callback error:", err);
            }
          });

          this.notifyTelemetry();

          if (isFinal) {
            // Roll to next utterance ID for subsequent phrases
            this.currentUtteranceId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            this.currentRevision = 0;
            // Clear interim timings for next utterance
            this.timings.firstInterimMs = undefined;
            this.timings.subsequentInterimsCount = 0;
            this.timings.onSpeechStartMs = undefined;
          }
        }
      };

      // 6. onspeechend — Speech recognized by the service has stopped
      rec.onspeechend = () => {
        if (genId !== this.currentGenerationId) return;
        this.timings.onSpeechEndMs = performance.now();
        this.notifyTelemetry();
      };

      // 7. onsoundend — Sound in audio stream has stopped
      rec.onsoundend = () => {
        if (genId !== this.currentGenerationId) return;
        this.timings.onSoundEndMs = performance.now();
        this.notifyTelemetry();
      };

      // 8. onaudioend — Audio capture has ended
      rec.onaudioend = () => {
        if (genId !== this.currentGenerationId) return;
        this.timings.onAudioEndMs = performance.now();
        this.notifyTelemetry();
      };

      // 9. onnomatch — Final result with no recognized speech
      rec.onnomatch = () => {
        if (genId !== this.currentGenerationId) return;
        this.errorCounts["no-match"] = (this.errorCounts["no-match"] || 0) + 1;
        this.notifyTelemetry();
      };

      // 10. onerror — Speech recognition errors
      rec.onerror = (event: ISpeechRecognitionErrorEvent) => {
        if (genId !== this.currentGenerationId) return;

        const errorType = event.error || "unknown";
        this.errorCounts[errorType] = (this.errorCounts[errorType] || 0) + 1;
        this.lastErrorCode = errorType;
        console.log(`[BrowserSTT] Event onerror: ${errorType}`);

        if (errorType === "not-allowed" || errorType === "service-not-allowed") {
          this.setState("error");
          this.errorListeners.forEach((cb) =>
            cb(new Error(`Microphone permission or STT service not allowed: ${errorType}`)),
          );
        } else if (errorType === "no-speech") {
          // Normal silence, keep listening
        }

        this.notifyTelemetry();
      };

      // 11. onend — Speech recognition disconnected
      rec.onend = () => {
        this.timings.onEndMs = performance.now();

        if (BrowserSpeechRecognitionProvider.activeInstances > 0) {
          BrowserSpeechRecognitionProvider.activeInstances--;
        }

        if (genId !== this.currentGenerationId || this.intendedState !== "listening") {
          this.setState("idle");
          return;
        }

        // Calculate graceful restart delay based on last error
        let restartDelayMs = 300;
        if (this.lastErrorCode === "aborted") {
          restartDelayMs = 800;
        } else if (this.lastErrorCode === "network") {
          restartDelayMs = 1500;
        } else if (this.lastErrorCode === "no-speech") {
          restartDelayMs = 400;
        }

        this.restartCount++;
        this.notifyTelemetry();

        setTimeout(() => {
          if (genId === this.currentGenerationId && this.intendedState === "listening") {
            this.initRecognition(genId);
          }
        }, restartDelayMs);
      };

      this.recognition = rec;
      rec.start();
    } catch (err) {
      if (genId === this.currentGenerationId) {
        console.warn("[BrowserSTT] Failed to start recognition:", err);
        this.errorCounts["init-exception"] = (this.errorCounts["init-exception"] || 0) + 1;
        this.setState("error");
        this.notifyTelemetry();
      }
    }
  }

  public emitTranscript(text: string, isFinal = true): void {
    if (!this.currentUtteranceId) {
      this.currentUtteranceId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    this.currentRevision++;
    const item: TranscriptResult = {
      utteranceId: this.currentUtteranceId,
      revision: this.currentRevision,
      text,
      isFinal,
      confidence: 0.98,
      timings: { ...this.metrics },
    };
    this.transcriptListeners.forEach((cb) => {
      try {
        cb(item);
      } catch (err) {
        console.warn("[BrowserSTT] Callback error:", err);
      }
    });
    if (isFinal) {
      this.currentUtteranceId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.currentRevision = 0;
    }
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
    // Send immediate snapshot
    cb(this.getTelemetry());
    return () => this.telemetryListeners.delete(cb);
  }
}
