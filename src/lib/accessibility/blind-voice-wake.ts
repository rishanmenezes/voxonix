// Minimal volume RMS threshold considered audible speech into the microphone
export const LOUD_VOICE_RMS_THRESHOLD = 0.035;

// Minimal speech RMS threshold to wake VAD segmenter (sensitive to quiet speech while keeping silence idle)
export const VAD_SPEECH_RMS_THRESHOLD = 0.008;

// Debounce cooldown (ms)
export const WAKE_DEBOUNCE_MS = 1800;

export interface BlindVoicePreferences {
  rate: number;
  pitch: number;
  volume: number;
  voiceURI: string | null;
  language: string;
}

export const DEFAULT_BLIND_VOICE_PREFERENCES: BlindVoicePreferences = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voiceURI: "Shivani",
  language: "en-IN",
};

export type VoiceState =
  | "disabled"
  | "checking_permission"
  | "requesting_permission"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "permission_denied"
  | "device_unavailable"
  | "error";

export interface PendingConfirmationState {
  action: "submit_registration" | "logout" | "end_call";
  prompt: string;
}

export type WakeStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "permission_denied"
  | "device_unavailable"
  | "locked_out";

export type OnboardingState =
  | "idle"
  | "wake_detected"
  | "awaiting_auth_intent"
  | "transitioning_register"
  | "transitioning_login";

const WAKE_WORD_NEGATION_RE = /\b(?:not|no|dont|don't|never)\s+blind\b/i;

/**
 * Normalizes a Gnani Prisma wake-word transcript (case, whitespace, punctuation) and
 * returns true strictly for intended spoken "Blind" wake phrases without triggering on
 * accidental partials (e.g. "bind", "find", "mind") or negations.
 */
export function isWakeWordBlind(rawTranscript: string): boolean {
  const normalized = rawTranscript
    .toLowerCase()
    .replace(/[.,!?;:'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || WAKE_WORD_NEGATION_RE.test(normalized)) {
    return false;
  }
  if (
    /^(?:blind|i am blind|im blind|i m blind|blind mode|blind profile|select blind|choose blind|activate blind|voxonix blind|hey voxonix blind)$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 4 && words.includes("blind");
}

export interface BlindVoiceAssistantContextType {
  isVoiceGuideActive: boolean;
  isListening: boolean;
  isPaused: boolean;
  isSpeaking: boolean;
  voiceGuidanceEnabled: boolean;
  wakeStatus: WakeStatus;
  onboardingState: OnboardingState;
  isLockedOutForSession: boolean;
  blindActivationPending: boolean;
  clearBlindActivationPending: () => void;
  blindLoginPending: boolean;
  clearBlindLoginPending: () => void;
  retryWakePermission: () => Promise<boolean>;
  lockOutBlindForSession: () => void;
  selectBlindProfileAndStart: (source?: "wake" | "visual") => Promise<void>;
  startBlindVoiceLogin: () => Promise<void>;
  completeBlindLoginSuccess: () => Promise<void>;
  volumeLevel: number;
  isLoudEnough: boolean;
  lastSpokenText: string | null;
  lastTranscript: string | null;
  assistantError: string | null;
  ttsError: string | null;
  voicePreferences: BlindVoicePreferences;
  voiceState: VoiceState;
  hasAudioStream: boolean;
  activeTrackCount: number;
  isSpeechSupported: boolean;
  micPermission: "granted" | "denied" | "prompt" | "unknown";
  gnaniAvailable: boolean;
  pendingConfirmation: PendingConfirmationState | null;
  enableVoiceGuidance: () => Promise<boolean>;
  disableVoiceGuidance: () => void;
  pauseListening: (silent?: boolean) => void;
  resumeListening: () => Promise<boolean>;
  activateVoiceGuide: (reason?: string) => void;
  deactivateVoiceGuide: (silent?: boolean) => void;
  toggleVoiceGuide: () => void;
  speak: (text: string, force?: boolean, onFinished?: () => void) => void;
  repeatLastSpoken: () => void;
  cancelSpeech: () => void;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
  updateVoicePreferences: (partial: Partial<BlindVoicePreferences>) => void;
  startVoiceListening: (userInitiated?: boolean) => Promise<boolean>;
  stopVoiceListening: () => void;
}

/**
 * Computes root-mean-square acoustic energy in [0, 1].
 */
export function computeAudioRms(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

export interface SegmenterFrameOptions {
  activeMode: boolean;
  silenceHangMs?: number;
  maxUtteranceMs?: number;
}

/**
 * Resamples mono Float32 PCM audio from arbitrary browser sample rates (e.g. 48kHz / 44.1kHz)
 * down to 16,000 Hz required by Gnani Prisma v3.0 using a Hann-windowed sinc anti-aliasing filter
 * so high frequencies (>8kHz) do not fold back into speech consonants.
 */
export function downsampleTo16kHz(samples: Float32Array, sourceRate: number): Float32Array {
  if (!samples || samples.length === 0) return new Float32Array(0);
  if (sourceRate === 16000 || sourceRate <= 0) {
    return new Float32Array(samples);
  }
  const ratio = sourceRate / 16000;
  const targetLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(targetLength);

  if (ratio <= 1.05) {
    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * ratio;
      const low = Math.floor(srcIdx);
      const high = Math.min(samples.length - 1, low + 1);
      const frac = srcIdx - low;
      out[i] = samples[low] * (1 - frac) + samples[high] * frac;
    }
    return out;
  }

  // Bandlimited Hann-windowed sinc interpolation (cutoff at ~0.9 * Nyquist_16k)
  const fc = 0.45 / ratio;
  const halfWidth = Math.min(10, Math.max(4, Math.ceil(ratio * 2)));

  for (let i = 0; i < targetLength; i++) {
    const center = i * ratio;
    const start = Math.max(0, Math.ceil(center - halfWidth));
    const end = Math.min(samples.length - 1, Math.floor(center + halfWidth));
    let sum = 0;
    let weightSum = 0;

    for (let j = start; j <= end; j++) {
      const d = j - center;
      const sinc = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const winPos = d / (halfWidth + 1);
      const windowVal = 0.5 * (1 + Math.cos(Math.PI * winPos));
      const w = sinc * windowVal;
      sum += samples[j] * w;
      weightSum += w;
    }

    const v =
      weightSum > 1e-8
        ? sum / weightSum
        : samples[Math.min(samples.length - 1, Math.round(center))];
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return out;
}

/**
 * Gently boosts quiet microphone utterances (bounded <= 3.5x gain, peak <= 0.65)
 * without clipping loud speech or aggressively amplifying ambient noise.
 */
export function normalizeQuietUtteranceAudio(samples: Float32Array): Float32Array {
  if (!samples || samples.length === 0) return samples;
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs < 0.018 || maxAbs >= 0.35) {
    return samples;
  }
  const gain = Math.min(3.5, 0.65 / maxAbs);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const scaled = samples[i] * gain;
    out[i] = scaled > 0.95 ? 0.95 : scaled < -0.95 ? -0.95 : scaled;
  }
  return out;
}

/**
 * Encodes normalized 16kHz Float32 PCM samples into base64 signed 16-bit LE PCM bytes
 * for Gnani Prisma v3.0 server transcription.
 */
export function encodeFloat32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

/**
 * Fast FNV-1a acoustic fingerprint over quantized PCM16 samples so duplicate consecutive
 * utterances or unchanged buffered recordings are never uploaded twice to Gnani STT.
 */
export function hashAudioSamples(samples: Float32Array): string {
  let hash = 2166136261 >>> 0;
  const stride = samples.length > 8000 ? Math.floor(samples.length / 2000) : 1;
  for (let i = 0; i < samples.length; i += stride) {
    const quantized = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))) & 0xffff;
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (quantized >>> 8) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `${samples.length}:${hash.toString(16)}`;
}

/**
 * Stateful Voice Activity Detection (VAD) utterance segmenter for 16kHz mono audio.
 * Buffers generous pre-roll frames and dispatches complete spoken utterances to Gnani Prisma
 * with per-field pause tolerance (silenceHangMs) and duration caps (maxUtteranceMs).
 */
export class WakeUtteranceSegmenter {
  private readonly targetSampleRate = 16000;
  private readonly speechThreshold: number;
  private readonly minPeakRms: number;
  private readonly minUtteranceSamples: number;
  private readonly maxUtteranceSamplesStandby: number;
  private readonly maxUtteranceSamplesActive: number;
  private readonly defaultSilenceHangSamples: number;
  private readonly preRollCapacity: number;

  private preRollBuffer: Float32Array[] = [];
  private preRollSamples = 0;
  private activeChunks: Float32Array[] = [];
  private activeSamples = 0;
  private voicedSamples = 0;
  private trailingSilenceSamples = 0;
  private isSpeechActive = false;
  private noiseFloorRms = 0;
  private peakRms = 0;
  private rmsSum = 0;
  private rmsFrames = 0;

  constructor(options?: {
    speechThreshold?: number;
    minPeakRms?: number;
    minUtteranceMs?: number;
    silenceHangMs?: number;
    preRollMs?: number;
  }) {
    this.speechThreshold = options?.speechThreshold ?? VAD_SPEECH_RMS_THRESHOLD;
    this.minPeakRms = options?.minPeakRms ?? 0.014;
    this.minUtteranceSamples = Math.round(
      ((options?.minUtteranceMs ?? 160) / 1000) * this.targetSampleRate,
    );
    this.defaultSilenceHangSamples = Math.round(
      ((options?.silenceHangMs ?? 680) / 1000) * this.targetSampleRate,
    );
    this.preRollCapacity = Math.round(((options?.preRollMs ?? 420) / 1000) * this.targetSampleRate);
    this.maxUtteranceSamplesStandby = Math.round(4.0 * this.targetSampleRate);
    this.maxUtteranceSamplesActive = Math.round(16.0 * this.targetSampleRate);
  }

  reset(): void {
    this.preRollBuffer = [];
    this.preRollSamples = 0;
    this.activeChunks = [];
    this.activeSamples = 0;
    this.voicedSamples = 0;
    this.trailingSilenceSamples = 0;
    this.isSpeechActive = false;
    this.peakRms = 0;
    this.rmsSum = 0;
    this.rmsFrames = 0;
  }

  private getEffectiveSpeechThreshold(): number {
    return Math.max(this.speechThreshold, Math.min(0.028, this.noiseFloorRms * 2.0));
  }

  push16kHzFrame(
    frame: Float32Array,
    modeOrOptions: boolean | SegmenterFrameOptions,
  ): { audio: Float32Array; meanRms: number; peakRms: number } | null {
    if (!frame || frame.length === 0) return null;
    const activeMode =
      typeof modeOrOptions === "boolean" ? modeOrOptions : modeOrOptions.activeMode;
    const hangSamples =
      typeof modeOrOptions === "object" && typeof modeOrOptions.silenceHangMs === "number"
        ? Math.round((modeOrOptions.silenceHangMs / 1000) * this.targetSampleRate)
        : activeMode
          ? this.defaultSilenceHangSamples
          : Math.round(0.45 * this.targetSampleRate);
    const maxSamples =
      typeof modeOrOptions === "object" && typeof modeOrOptions.maxUtteranceMs === "number"
        ? Math.round((modeOrOptions.maxUtteranceMs / 1000) * this.targetSampleRate)
        : activeMode
          ? this.maxUtteranceSamplesActive
          : this.maxUtteranceSamplesStandby;

    const rms = computeAudioRms(frame);
    const threshold = this.getEffectiveSpeechThreshold();

    if (!this.isSpeechActive) {
      if (rms >= threshold) {
        this.isSpeechActive = true;
        this.activeChunks = [...this.preRollBuffer, new Float32Array(frame)];
        this.activeSamples = this.preRollSamples + frame.length;
        this.voicedSamples = frame.length;
        this.preRollBuffer = [];
        this.preRollSamples = 0;
        this.trailingSilenceSamples = 0;
        this.peakRms = rms;
        this.rmsSum = rms;
        this.rmsFrames = 1;
      } else {
        this.noiseFloorRms =
          this.noiseFloorRms === 0 ? rms * 0.5 : this.noiseFloorRms * 0.96 + rms * 0.04;
        const copy = new Float32Array(frame);
        this.preRollBuffer.push(copy);
        this.preRollSamples += copy.length;
        while (this.preRollSamples > this.preRollCapacity && this.preRollBuffer.length > 0) {
          const dropped = this.preRollBuffer.shift()!;
          this.preRollSamples -= dropped.length;
        }
      }
      return null;
    }

    this.activeChunks.push(new Float32Array(frame));
    this.activeSamples += frame.length;
    this.rmsSum += rms;
    this.rmsFrames += 1;
    if (rms > this.peakRms) this.peakRms = rms;

    if (rms >= threshold * 0.48) {
      this.voicedSamples += frame.length;
      this.trailingSilenceSamples = 0;
    } else {
      this.trailingSilenceSamples += frame.length;
    }

    if (this.trailingSilenceSamples >= hangSamples || this.activeSamples >= maxSamples) {
      return this.flushUtterance();
    }

    return null;
  }

  flushUtterance(): { audio: Float32Array; meanRms: number; peakRms: number } | null {
    if (
      !this.isSpeechActive ||
      this.voicedSamples < this.minUtteranceSamples ||
      this.peakRms < this.minPeakRms
    ) {
      this.reset();
      return null;
    }
    const total = new Float32Array(this.activeSamples);
    let offset = 0;
    for (const chunk of this.activeChunks) {
      total.set(chunk, offset);
      offset += chunk.length;
    }
    const meanRms = this.rmsFrames > 0 ? this.rmsSum / this.rmsFrames : 0;
    const peakRms = this.peakRms;
    this.reset();
    return { audio: total, meanRms, peakRms };
  }
}
