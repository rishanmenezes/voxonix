import type { TTSProvider, TTSVoice, TTSConfig, TTSQueueItem, TTSState } from "./types";

export const GNANI_TIMBRE_VOICES: TTSVoice[] = [
  { id: "Shivani", name: "Shivani (Gnani Timbre v3.0)", lang: "en-IN", default: true },
  { id: "Avinash", name: "Avinash (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Lakshmi", name: "Lakshmi (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Riyaa", name: "Riyaa (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Kalpana", name: "Kalpana (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Shubham", name: "Shubham (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Prakash", name: "Prakash (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Devansh", name: "Devansh (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Yashraj", name: "Yashraj (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Chetana", name: "Chetana (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Vasudha", name: "Vasudha (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Harshad", name: "Harshad (Gnani Timbre v3.0)", lang: "en-IN", default: false },
  { id: "Tarika", name: "Tarika (Gnani Timbre v3.0)", lang: "en-IN", default: false },
];

export const GNANI_TTS_UNAVAILABLE_MESSAGE =
  "Speech output is temporarily unavailable. Response displayed as text.";

const MAX_CLIENT_TTS_CACHE_ENTRIES = 64;
const SENSITIVE_TTS_PATTERN = /\b(?:password|passphrase|credential|secret|token|otp|cvv|ssn)\b/i;

export function isSensitiveTtsText(text: string): boolean {
  return SENSITIVE_TTS_PATTERN.test(text);
}

export function buildClientTtsCacheKey(params: {
  voice: string;
  language: string;
  speed: number;
  sampleRate: number;
  text: string;
}): string {
  return JSON.stringify([
    "timbre-v3.0",
    params.voice.trim() || "Shivani",
    params.language.trim() || "en-IN",
    Number(params.speed.toFixed(2)),
    params.sampleRate,
    params.text.trim(),
  ]);
}

export interface GnaniTtsCacheStats {
  hits: number;
  misses: number;
  entries: number;
}

export interface GnaniSpeakOptions {
  voice?: string;
  language?: string;
  speed?: number;
  volume?: number;
  useStreamingSse?: boolean;
}

/**
 * Centralized Gnani Timbre v3.0 TTS Provider (`POST /api/ai/gnani/tts` & `/api/ai/gnani/tts/sse`).
 *
 * Guarantees:
 * - Single utterance active at a time (canceling prior HTTP requests and audio elements immediately).
 * - Zero silent fallback to `window.speechSynthesis` or any external provider.
 * - Clean state/error telemetry so callers pause mic capture during playback and show text on failure.
 */
export class GnaniTTSProvider implements TTSProvider {
  public readonly id = "gnani-timbre-v3";
  public readonly name = "Gnani Timbre v3.0";

  private state: TTSState = "idle";
  private activeAbortController: AbortController | null = null;
  private activeAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private activeResolve: (() => void) | null = null;
  private utteranceToken = 0;

  private stateListeners = new Set<(state: TTSState) => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private wavCache = new Map<string, Blob>();
  private cacheHits = 0;
  private cacheMisses = 0;

  public getCacheStats(): GnaniTtsCacheStats {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      entries: this.wavCache.size,
    };
  }

  public clearCache(): void {
    this.wavCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  private readCache(key: string): Blob | null {
    const found = this.wavCache.get(key);
    if (!found) return null;
    this.wavCache.delete(key);
    this.wavCache.set(key, found);
    return found;
  }

  private writeCache(key: string, blob: Blob): void {
    if (this.wavCache.has(key)) {
      this.wavCache.delete(key);
    }
    while (this.wavCache.size >= MAX_CLIENT_TTS_CACHE_ENTRIES) {
      const oldest = this.wavCache.keys().next().value;
      if (oldest === undefined) break;
      this.wavCache.delete(oldest);
    }
    this.wavCache.set(key, blob);
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && typeof Audio !== "undefined";
  }

  public getState(): TTSState {
    return this.state;
  }

  private setState(next: TTSState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((cb) => {
      try {
        cb(next);
      } catch (err) {
        console.warn("[GnaniTTS] State listener error:", err);
      }
    });
  }

  private emitError(err: Error): void {
    this.errorListeners.forEach((cb) => {
      try {
        cb(err);
      } catch (e) {
        console.warn("[GnaniTTS] Error listener failed:", e);
      }
    });
  }

  private cleanupAudio(): void {
    if (this.activeAudio) {
      try {
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.pause();
        this.activeAudio.src = "";
      } catch {
        // Ignore cleanup errors
      }
      this.activeAudio = null;
    }
    if (this.activeObjectUrl) {
      try {
        URL.revokeObjectURL(this.activeObjectUrl);
      } catch {
        // Ignore revoke errors
      }
      this.activeObjectUrl = null;
    }
    if (this.activeResolve) {
      const r = this.activeResolve;
      this.activeResolve = null;
      r();
    }
  }

  public async getVoices(): Promise<TTSVoice[]> {
    return GNANI_TIMBRE_VOICES;
  }

  public async unlock(): Promise<boolean> {
    return this.isSupported();
  }

  /**
   * Speaks text through Gnani Timbre v3.0 server proxy.
   * For long responses (> 260 chars), streams chunks from `/api/ai/gnani/tts/sse`
   * and assembles complete PCM16 WAV playback; shorter responses use `/api/ai/gnani/tts`.
   */
  public async speakText(text: string, opts: GnaniSpeakOptions = {}): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.cancel();
    const myToken = ++this.utteranceToken;

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.setState("speaking");

    try {
      const voice = (opts.voice || "Shivani").trim() || "Shivani";
      const language = (opts.language || "en-IN").trim() || "en-IN";
      const rawSpeed = opts.speed ?? 1.0;
      const speed = Math.max(0.6, Math.min(1.6, Number.isFinite(rawSpeed) ? rawSpeed : 1.0));
      const useSse = Boolean(opts.useStreamingSse || trimmed.length > 260);
      const sampleRate = useSse ? 16000 : 24000;
      const cacheKey = isSensitiveTtsText(trimmed)
        ? null
        : buildClientTtsCacheKey({ voice, language, speed, sampleRate, text: trimmed });

      if (cacheKey) {
        const cachedBlob = this.readCache(cacheKey);
        if (cachedBlob && cachedBlob.size >= 44) {
          this.cacheHits++;
          await this.playWavBlob(cachedBlob, opts.volume ?? 1.0, myToken);
          return;
        }
      }

      this.cacheMisses++;
      const endpoint = useSse ? "/api/ai/gnani/tts/sse" : "/api/ai/gnani/tts";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice,
          language,
          speed,
          sampleRate,
        }),
        signal: controller.signal,
      });

      if (myToken !== this.utteranceToken) return;

      if (!response.ok) {
        let serverErr = `Gnani Timbre returned HTTP ${response.status}`;
        try {
          const j = (await response.json()) as { error?: string };
          if (j.error) serverErr = j.error;
        } catch {
          // ignore
        }
        throw new Error(serverErr);
      }

      const wavBlob = useSse
        ? await collectSseWavBlob(response, controller.signal)
        : await response.blob();

      if (myToken !== this.utteranceToken) return;

      if (!wavBlob || wavBlob.size < 44) {
        throw new Error("Gnani Timbre returned empty audio.");
      }

      if (cacheKey) {
        this.writeCache(cacheKey, wavBlob);
      }

      await this.playWavBlob(wavBlob, opts.volume ?? 1.0, myToken);
    } catch (err: unknown) {
      if (myToken !== this.utteranceToken) {
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        this.setState("idle");
        return;
      }
      this.cleanupAudio();
      this.activeAbortController = null;
      this.setState("error");
      const wrapped = err instanceof Error ? err : new Error(GNANI_TTS_UNAVAILABLE_MESSAGE);
      this.emitError(wrapped);
      throw wrapped;
    }
  }

  private playWavBlob(wavBlob: Blob, volume: number, token: number): Promise<void> {
    if (typeof Audio === "undefined" || typeof URL === "undefined") {
      this.setState("idle");
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      if (token !== this.utteranceToken) {
        resolve();
        return;
      }

      const objectUrl = URL.createObjectURL(wavBlob);
      const audio = new Audio(objectUrl);
      audio.volume = Math.max(0, Math.min(1, volume));
      this.activeObjectUrl = objectUrl;
      this.activeAudio = audio;

      let settled = false;
      const safetyTimer = setTimeout(() => {
        if (!settled && token === this.utteranceToken) {
          finishOk();
        }
      }, 25_000);

      const finishOk = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        this.cleanupAudio();
        this.activeAbortController = null;
        if (token === this.utteranceToken) {
          this.setState("idle");
        }
        resolve();
      };

      const finishErr = (reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        this.cleanupAudio();
        this.activeAbortController = null;
        if (token === this.utteranceToken) {
          this.setState("error");
          const error = new Error(reason);
          this.emitError(error);
          reject(error);
        } else {
          resolve();
        }
      };

      this.activeResolve = finishOk;
      audio.onended = finishOk;
      audio.onerror = () => finishErr("Audio playback failed for Gnani Timbre WAV.");

      audio.play().catch((playErr: unknown) => {
        const msg = playErr instanceof Error ? playErr.message : "Browser blocked audio playback";
        // If browser autoplay blocks unsolicited playback before user gesture, avoid falsely failing
        // while keeping visible text & letting error listeners know only on genuine failures.
        if (
          msg.toLowerCase().includes("notallowed") ||
          msg.toLowerCase().includes("user didn't interact")
        ) {
          finishErr("Browser blocked automatic audio playback until user interaction.");
          return;
        }
        finishErr(msg);
      });
    });
  }

  public async speak(item: TTSQueueItem, config: TTSConfig): Promise<void> {
    await this.speakText(item.text, {
      voice: config.voiceId || "Shivani",
      language: config.language || "en-IN",
      speed: config.rate || 1.0,
      volume: config.volume ?? 1.0,
    });
  }

  public cancel(): void {
    this.utteranceToken++;
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {
        // Ignore abort errors
      }
      this.activeAbortController = null;
    }
    this.cleanupAudio();
    this.setState("idle");
  }

  public pause(): void {
    if (this.activeAudio && !this.activeAudio.paused) {
      this.activeAudio.pause();
      this.setState("paused");
    }
  }

  public resume(): void {
    if (this.activeAudio && this.activeAudio.paused) {
      void this.activeAudio.play().catch(() => {});
      this.setState("speaking");
    }
  }

  public onStateChange(callback: (state: TTSState) => void): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  public onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }
}

/**
 * Reads Gnani Timbre SSE chunks (`chunk_index` base64 WAV + raw PCM tail) into one valid WAV Blob.
 */
async function collectSseWavBlob(response: Response, signal: AbortSignal): Promise<Blob> {
  if (!response.body) {
    return new Blob([], { type: "audio/wav" });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const audioParts: Uint8Array[] = [];

  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const dataLine = block.split(/\r?\n/).find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr) as { audio?: string };
          if (parsed.audio) {
            const raw = atob(parsed.audio);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              bytes[i] = raw.charCodeAt(i);
            }
            audioParts.push(bytes);
          }
        } catch {
          // Ignore non-JSON SSE keepalives
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (audioParts.length === 0) {
    return new Blob([], { type: "audio/wav" });
  }

  // First chunk contains a RIFF/WAVE header (with placeholder size 0xffffffff).
  // Re-header total assembled PCM size cleanly so standard HTMLAudioElement plays all chunks.
  let totalLen = 0;
  for (const p of audioParts) totalLen += p.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of audioParts) {
    combined.set(p, offset);
    offset += p.length;
  }

  if (
    combined.length >= 44 &&
    combined[0] === 0x52 && // R
    combined[1] === 0x49 && // I
    combined[2] === 0x46 && // F
    combined[3] === 0x46
  ) {
    const view = new DataView(combined.buffer);
    view.setUint32(4, combined.length - 8, true);
    view.setUint32(40, combined.length - 44, true);
  }

  return new Blob([combined.buffer], { type: "audio/wav" });
}

let sharedProvider: GnaniTTSProvider | null = null;

export function getSharedGnaniTtsProvider(): GnaniTTSProvider {
  if (!sharedProvider) {
    sharedProvider = new GnaniTTSProvider();
  }
  return sharedProvider;
}
