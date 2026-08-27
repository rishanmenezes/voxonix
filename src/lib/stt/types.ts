export interface STTLifecycleTimings {
  startCalledMs?: number;
  onStartMs?: number;
  onAudioStartMs?: number;
  onSoundStartMs?: number;
  onSpeechStartMs?: number;
  firstInterimMs?: number;
  subsequentInterimsCount: number;
  lastInterimMs?: number;
  onSpeechEndMs?: number;
  onSoundEndMs?: number;
  onAudioEndMs?: number;
  finalResultMs?: number;
  onEndMs?: number;
}

export interface STTSegmentLatency {
  serviceInitLatencyMs?: number;
  speechDetectionLatencyMs?: number;
  firstInterimLatencyMs?: number;
  finalResultLatencyMs?: number;
  totalRecognitionLatencyMs?: number;
}

export interface AudioStreamingStats {
  negotiatedMimeType?: string;
  lastChunkDurationMs?: number;
  lastChunkArrivalIntervalMs?: number;
  lastChunkByteLength?: number;
  avgChunkArrivalIntervalMs?: number;
  totalChunksStreamed?: number;
}

export interface STTTelemetry {
  providerId: string;
  providerName: string;
  isSupported: boolean;
  activeInstancesCount: number;
  restartCount: number;
  errorCounts: Record<string, number>;
  latestTimings: STTLifecycleTimings;
  latestMetrics: STTSegmentLatency;
  streamingStats?: AudioStreamingStats;
  recentUtteranceCount: number;
  recentWordsCount: number;
}

export interface CaptionEvent {
  captionId: string;
  utteranceId: string;
  revision: number;
  speakerPeerId: string;
  speakerDisplayName: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  language?: string;
  clientSentAt?: number;
  serverReceivedAt?: number;
  serverSentAt?: number;
}

export interface TranscriptResult {
  utteranceId: string;
  revision: number;
  text: string;
  isFinal: boolean;
  confidence?: number;
  timings?: STTSegmentLatency;
}

export interface STTConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export type STTState = "idle" | "listening" | "paused" | "error" | "unsupported";

export interface STTProvider {
  id: string;
  name: string;
  isSupported(): boolean;
  start(config?: STTConfig): Promise<void>;
  stop(): Promise<void>;
  getState(): STTState;
  getTelemetry(): STTTelemetry;
  onTranscript(cb: (result: TranscriptResult) => void): () => void;
  onError(cb: (error: Error) => void): () => void;
  onStateChange(cb: (state: STTState) => void): () => void;
  onTelemetry?(cb: (telemetry: STTTelemetry) => void): () => void;
}
