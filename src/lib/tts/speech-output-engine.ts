import type {
  TTSProvider,
  TTSConfig,
  TTSQueueItem,
  TTSState,
  TTSTelemetry,
  TTSVoice,
  TTSAudioDeviceMode,
} from "./types";
import { BrowserTTSProvider } from "./browser-tts-provider";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

export interface SpeechOutputEngineOptions {
  localPeerId: string;
  initialConfig?: Partial<TTSConfig>;
  provider?: TTSProvider;
  onTelemetry?: (telemetry: TTSTelemetry) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onDuckingChange?: (isDucked: boolean) => void;
}

interface SynthesizedHistoryItem {
  text: string;
  normalized: string;
  timestamp: number;
}

export class SpeechOutputEngine {
  private provider: TTSProvider;
  private localPeerId: string;
  private config: TTSConfig = {
    enabled: false,
    autoSpeakCaptions: true,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    language: "en-US",
    duckMicDuringSpeech: true,
    audioDeviceMode: "speakers", // Default to speakers mode for maximum feedback safety
    interruptBacklogOnTyped: true, // Immediately interrupt caption backlog on typed speech
  };

  private queue: TTSQueueItem[] = [];
  private isProcessingQueue = false;
  private processedUtteranceIds = new Set<string>();
  private readonly maxProcessedCacheSize = 200;
  private readonly maxQueueLength = 10; // Drop stale backlog if speaker gets behind

  // Acoustic feedback isolation & telemetry
  private totalSpokenUtterances = 0;
  private feedbackSuppressionsCount = 0;
  private acousticEchoSuppressionsCount = 0;
  private interruptionCount = 0;
  private isMicDucked = false;
  private isUnlocked = false;
  private lastSpokenText: string | undefined;
  private lastSynthesisLatencyMs: number | undefined;
  private duckingTailTimer: ReturnType<typeof setTimeout> | null = null;
  private recentSynthesized: SynthesizedHistoryItem[] = [];

  private telemetryListeners = new Set<(telemetry: TTSTelemetry) => void>();
  private speakingListeners = new Set<(isSpeaking: boolean) => void>();
  private duckingListeners = new Set<(isDucked: boolean) => void>();

  constructor(options: SpeechOutputEngineOptions) {
    this.localPeerId = options.localPeerId;
    this.provider = options.provider || new BrowserTTSProvider();

    if (options.initialConfig) {
      this.config = { ...this.config, ...options.initialConfig };
    }

    if (options.onTelemetry) {
      this.telemetryListeners.add(options.onTelemetry);
    }
    if (options.onSpeakingChange) {
      this.speakingListeners.add(options.onSpeakingChange);
    }
    if (options.onDuckingChange) {
      this.duckingListeners.add(options.onDuckingChange);
    }

    this.provider.onStateChange((state) => {
      const isSpeaking = state === "speaking";
      this.speakingListeners.forEach((cb) => cb(isSpeaking));
      this.handleSpeakingStateTransition(isSpeaking);
      this.notifyTelemetry();
    });

    this.provider.onError((err) => {
      console.warn("[SpeechOutputEngine] Provider error:", err);
      this.notifyTelemetry();
    });
  }

  public setLocalPeerId(peerId: string): void {
    this.localPeerId = peerId;
  }

  public getConfig(): TTSConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled) {
      this.cancelAll();
    }
    this.notifyTelemetry();
  }

  public async unlock(): Promise<boolean> {
    const ok = await this.provider.unlock();
    if (ok) {
      this.isUnlocked = true;
      this.notifyTelemetry();
    }
    return ok;
  }

  public async getVoices(): Promise<TTSVoice[]> {
    return this.provider.getVoices();
  }

  public getState(): TTSState {
    return this.provider.getState();
  }

  public getTelemetry(): TTSTelemetry {
    return {
      isSupported: this.provider.isSupported(),
      activeState: this.provider.getState(),
      queueLength: this.queue.length,
      totalSpokenUtterances: this.totalSpokenUtterances,
      lastSpokenText: this.lastSpokenText,
      lastSynthesisLatencyMs: this.lastSynthesisLatencyMs,
      feedbackSuppressionsCount: this.feedbackSuppressionsCount,
      acousticEchoSuppressionsCount: this.acousticEchoSuppressionsCount,
      isMicDucked: this.isMicDucked,
      audioDeviceMode: this.config.audioDeviceMode,
      interruptionCount: this.interruptionCount,
      activeVoiceName: this.config.voiceId,
      isUnlocked: this.isUnlocked,
    };
  }

  private notifyTelemetry() {
    const tel = this.getTelemetry();
    this.telemetryListeners.forEach((cb) => {
      try {
        cb(tel);
      } catch (err) {
        console.warn("[SpeechOutputEngine] Telemetry listener error:", err);
      }
    });
  }

  /**
   * Software Mic Ducking Coordination
   * Gated during active speech synthesis when in 'speakers' audio device mode.
   */
  private handleSpeakingStateTransition(isSpeaking: boolean) {
    if (this.duckingTailTimer) {
      clearTimeout(this.duckingTailTimer);
      this.duckingTailTimer = null;
    }

    if (isSpeaking) {
      if (this.config.duckMicDuringSpeech && this.config.audioDeviceMode === "speakers") {
        this.setMicDucked(true);
      }
    } else {
      // 300ms post-synthesis acoustic release tail to absorb speaker reverberation
      this.duckingTailTimer = setTimeout(() => {
        this.setMicDucked(false);
      }, 300);
    }
  }

  private setMicDucked(ducked: boolean) {
    if (this.isMicDucked === ducked) return;
    this.isMicDucked = ducked;
    this.duckingListeners.forEach((cb) => {
      try {
        cb(ducked);
      } catch (err) {
        console.warn("[SpeechOutputEngine] Ducking listener error:", err);
      }
    });
    this.notifyTelemetry();
  }

  /**
   * Acoustic Echo Detection:
   * Checks if an incoming candidate transcript from local microphone resembles
   * recently synthesized speech within a 5-second acoustic window.
   */
  public isAcousticEcho(candidateText: string): boolean {
    if (!candidateText || !candidateText.trim()) return false;
    const now = Date.now();

    // Clean aged history (> 5 seconds)
    this.recentSynthesized = this.recentSynthesized.filter((h) => now - h.timestamp < 5000);

    if (this.recentSynthesized.length === 0) return false;

    const normCandidate = candidateText
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    if (!normCandidate || normCandidate.length < 3) return false;

    for (const item of this.recentSynthesized) {
      // 1. Substring containment
      if (item.normalized.includes(normCandidate) || normCandidate.includes(item.normalized)) {
        this.acousticEchoSuppressionsCount++;
        this.notifyTelemetry();
        return true;
      }

      // 2. Token overlap similarity
      const candTokens = new Set(normCandidate.split(/\s+/));
      const synTokens = new Set(item.normalized.split(/\s+/));
      if (candTokens.size > 0 && synTokens.size > 0) {
        let intersection = 0;
        candTokens.forEach((tok) => {
          if (synTokens.has(tok)) intersection++;
        });
        const similarity = intersection / Math.max(candTokens.size, synTokens.size);
        if (similarity >= 0.65) {
          this.acousticEchoSuppressionsCount++;
          this.notifyTelemetry();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Ingest a CaptionEvent from room signaling.
   * Enforces viewer-local settings, feedback loop isolation, and finalized sentence filtering.
   */
  public ingestCaption(caption: CaptionPayload): boolean {
    if (!this.config.enabled || !this.config.autoSpeakCaptions) {
      return false;
    }

    // Invariant 1: Only synthesize finalized utterances (isFinal=true)
    if (!caption.isFinal || !caption.text.trim()) {
      return false;
    }

    // Invariant 2: Feedback Loop Prevention - Speaker Attribution Check
    if (caption.speakerPeerId === this.localPeerId) {
      this.feedbackSuppressionsCount++;
      this.notifyTelemetry();
      return false;
    }

    // Invariant 3: De-duplication check
    if (this.processedUtteranceIds.has(caption.utteranceId)) {
      return false;
    }

    const item: TTSQueueItem = {
      id: `tts_${caption.utteranceId}`,
      utteranceId: caption.utteranceId,
      speakerPeerId: caption.speakerPeerId,
      speakerDisplayName: caption.speakerDisplayName,
      text: caption.text.trim(),
      source: "caption",
      timestamp: Date.now(),
      priority: 1,
    };

    return this.enqueue(item, false);
  }

  /**
   * Enqueue a typed text item from a non-speaking user ("Type to Speak").
   * High priority with immediate preemption / interruption UX.
   */
  public enqueueTypedSpeech(
    text: string,
    speakerDisplayName: string,
    utteranceId = `typed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  ): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const item: TTSQueueItem = {
      id: `tts_${utteranceId}`,
      utteranceId,
      speakerPeerId: this.localPeerId,
      speakerDisplayName,
      text: trimmed,
      source: "typed",
      timestamp: Date.now(),
      priority: 2,
    };

    return this.enqueue(item, this.config.interruptBacklogOnTyped);
  }

  private enqueue(item: TTSQueueItem, interruptBacklog = false): boolean {
    // Record in processed set
    this.processedUtteranceIds.add(item.utteranceId);
    if (this.processedUtteranceIds.size > this.maxProcessedCacheSize) {
      const first = this.processedUtteranceIds.values().next().value;
      if (first) this.processedUtteranceIds.delete(first);
    }

    if (interruptBacklog && item.source === "typed") {
      // Preemption: Interrupt currently playing caption and evict caption backlog
      this.interruptionCount++;
      this.provider.cancel();
      // Retain prior typed messages, evict background captions
      this.queue = this.queue.filter((q) => q.source === "typed");
      this.queue.unshift(item);
      this.isProcessingQueue = false;
      this.notifyTelemetry();
      this.processQueue();
      return true;
    }

    // Bounded queue: If queue exceeds max limit, evict lowest priority oldest item
    if (this.queue.length >= this.maxQueueLength) {
      const firstCaptionIdx = this.queue.findIndex((q) => q.source === "caption");
      if (firstCaptionIdx >= 0) {
        this.queue.splice(firstCaptionIdx, 1);
      } else {
        this.queue.shift();
      }
    }

    // Insert sorted by priority
    if (item.priority && item.priority > 1) {
      const firstLowerIndex = this.queue.findIndex((q) => (q.priority || 1) < item.priority!);
      if (firstLowerIndex >= 0) {
        this.queue.splice(firstLowerIndex, 0, item);
      } else {
        this.queue.push(item);
      }
    } else {
      this.queue.push(item);
    }

    this.notifyTelemetry();
    this.processQueue();
    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.queue.length === 0 || !this.config.enabled) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.queue.length > 0 && this.config.enabled) {
      const current = this.queue.shift()!;
      this.lastSpokenText = `${current.speakerDisplayName}: ${current.text}`;
      const startMs = performance.now();

      // Record in recent synthesized history for acoustic similarity gating
      const norm = current.text
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim();
      this.recentSynthesized.push({
        text: current.text,
        normalized: norm,
        timestamp: Date.now(),
      });
      if (this.recentSynthesized.length > 20) {
        this.recentSynthesized.shift();
      }

      try {
        await this.provider.speak(current, this.config);
        this.lastSynthesisLatencyMs = Math.round(performance.now() - startMs);
        this.totalSpokenUtterances++;
      } catch (err) {
        console.warn("[SpeechOutputEngine] Error synthesizing utterance:", err);
      }

      this.notifyTelemetry();
    }

    this.isProcessingQueue = false;
  }

  public cancelAll(): void {
    this.queue = [];
    this.provider.cancel();
    this.isProcessingQueue = false;
    this.handleSpeakingStateTransition(false);
    this.notifyTelemetry();
  }

  public pause(): void {
    this.provider.pause();
  }

  public resume(): void {
    this.provider.resume();
    this.processQueue();
  }

  public onTelemetry(cb: (telemetry: TTSTelemetry) => void): () => void {
    this.telemetryListeners.add(cb);
    cb(this.getTelemetry());
    return () => this.telemetryListeners.delete(cb);
  }

  public onSpeakingChange(cb: (isSpeaking: boolean) => void): () => void {
    this.speakingListeners.add(cb);
    return () => this.speakingListeners.delete(cb);
  }

  public onDuckingChange(cb: (isDucked: boolean) => void): () => void {
    this.duckingListeners.add(cb);
    return () => this.duckingListeners.delete(cb);
  }

  public destroy(): void {
    if (this.duckingTailTimer) {
      clearTimeout(this.duckingTailTimer);
      this.duckingTailTimer = null;
    }
    this.cancelAll();
    this.telemetryListeners.clear();
    this.speakingListeners.clear();
    this.duckingListeners.clear();
  }
}
