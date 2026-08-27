export type TTSState = "idle" | "speaking" | "paused" | "error" | "unsupported";

export type TTSAudioDeviceMode = "headphones" | "speakers";

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
}

export interface TTSConfig {
  enabled: boolean;
  autoSpeakCaptions: boolean;
  voiceId?: string;
  rate: number; // 0.5 to 2.0 (default 1.0)
  pitch: number; // 0.5 to 1.5 (default 1.0)
  volume: number; // 0.0 to 1.0 (default 1.0)
  language: string; // e.g. "en-US"
  duckMicDuringSpeech: boolean; // Software ducking of mic input to prevent acoustic feedback
  audioDeviceMode: TTSAudioDeviceMode; // "speakers" enforces mic ducking + similarity filter; "headphones" permits duplex
  interruptBacklogOnTyped: boolean; // Immediately pre-empts caption audio when user types
}

export interface TTSQueueItem {
  id: string;
  utteranceId: string;
  speakerPeerId: string;
  speakerDisplayName: string;
  text: string;
  source: "caption" | "typed";
  timestamp: number;
  priority?: number; // Higher number = higher priority
}

export interface TTSTelemetry {
  isSupported: boolean;
  activeState: TTSState;
  queueLength: number;
  totalSpokenUtterances: number;
  lastSpokenText?: string;
  lastSynthesisLatencyMs?: number;
  feedbackSuppressionsCount: number; // Speaker attribution self-suppression
  acousticEchoSuppressionsCount: number; // STT similarity & ducking suppression
  isMicDucked: boolean;
  audioDeviceMode: TTSAudioDeviceMode;
  interruptionCount: number;
  activeVoiceName?: string;
  isUnlocked: boolean; // Web Audio / SpeechSynthesis user-gesture activation state
}

export interface TTSProvider {
  id: string;
  name: string;
  isSupported(): boolean;
  unlock(): Promise<boolean>; // User gesture unlock
  getVoices(): Promise<TTSVoice[]>;
  speak(item: TTSQueueItem, config: TTSConfig): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  getState(): TTSState;
  onStateChange(cb: (state: TTSState) => void): () => void;
  onError(cb: (error: Error) => void): () => void;
}
