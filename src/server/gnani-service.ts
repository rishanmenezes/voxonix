import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";

export const GNANI_DEFAULT_STT_MODEL = "prisma-v3.0";
export const GNANI_DEFAULT_STT_REST_URL = "https://api.vachana.ai/stt/v3";
export const GNANI_DEFAULT_STT_WS_URL = "wss://api.vachana.ai/stt/v3/stream";

export const GNANI_DEFAULT_TTS_MODEL = "timbre-v3.0";
export const GNANI_DEFAULT_TTS_REST_URL = "https://api.vachana.ai/api/v1/tts/inference";
export const GNANI_DEFAULT_TTS_SSE_URL = "https://api.vachana.ai/api/v1/tts/sse";
export const GNANI_DEFAULT_TTS_VOICE = "Shivani";

/** Verified voices supported by Gnani Timbre v3.0 (`timbre-v3.0`) */
export const GNANI_TIMBRE_V3_VOICES = [
  "Shivani",
  "Avinash",
  "Lakshmi",
  "Kalpana",
  "Shubham",
  "Prakash",
  "Devansh",
  "Yashraj",
  "Chetana",
  "Vasudha",
  "Harshad",
  "Riyaa",
  "Tarika",
] as const;

export type GnaniTimbreVoice = (typeof GNANI_TIMBRE_V3_VOICES)[number];

export interface GnaniConfig {
  apiKey: string;
  sttRestUrl: string;
  sttWsUrl: string;
  sttModel: string;
  ttsRestUrl: string;
  ttsSseUrl: string;
  ttsModel: string;
  ttsDefaultVoice: GnaniTimbreVoice;
}

export class GnaniValidationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GnaniValidationError";
    this.statusCode = statusCode;
  }
}

export const ALLOWED_GNANI_STT_PURPOSES = new Set([
  "wake",
  "onboarding_choice",
  "name",
  "name_spelling",
  "email",
  "email_spelling",
  "password",
  "password_spelling",
  "confirm_password",
  "confirm_password_spelling",
  "login_email",
  "login_email_spelling",
  "login_password",
  "login_password_spelling",
  "login_command",
  "command",
  "dictation",
  "general",
] as const);

const LOGIN_STT_PURPOSES = new Set([
  "login_email",
  "login_email_spelling",
  "login_password",
  "login_password_spelling",
  "login_command",
]);

const MAX_WAKE_PCM16_BYTES = 192_000; // <= 6 seconds @ 16kHz 16-bit mono
const MAX_ONBOARDING_CHOICE_PCM16_BYTES = 256_000; // <= 8 seconds @ 16kHz 16-bit mono
const MAX_GENERAL_PCM16_BYTES = 1_920_000; // <= 60 seconds @ 16kHz 16-bit mono

export class GnaniNotConfiguredError extends Error {
  constructor(message = "Gnani API key is not configured on the server.") {
    super(message);
    this.name = "GnaniNotConfiguredError";
  }
}

function readEnvFallbackKey(varName: string): string | undefined {
  const direct = process.env[varName]?.trim();
  if (direct) return direct;

  // Fallback for Vite SSR worker processes where `.env.local` may not auto-hydrate unprefixed vars into process.env
  for (const filename of [".env.local", ".env"]) {
    try {
      const filePath = path.join(process.cwd(), filename);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      const regex = new RegExp(`^${varName}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m");
      const match = content.match(regex);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    } catch {
      // Ignore unreadable env files
    }
  }
  return undefined;
}

export function getGnaniConfig(): GnaniConfig {
  const apiKey = readEnvFallbackKey("GNANI_API_KEY") || "";
  const sttRestUrl = readEnvFallbackKey("GNANI_STT_URL") || GNANI_DEFAULT_STT_REST_URL;
  const sttWsUrl = readEnvFallbackKey("GNANI_WS_URL") || GNANI_DEFAULT_STT_WS_URL;
  const ttsRestUrl = readEnvFallbackKey("GNANI_TTS_URL") || GNANI_DEFAULT_TTS_REST_URL;
  const ttsSseUrl = readEnvFallbackKey("GNANI_TTS_SSE_URL") || GNANI_DEFAULT_TTS_SSE_URL;
  return {
    apiKey,
    sttRestUrl,
    sttWsUrl,
    sttModel: GNANI_DEFAULT_STT_MODEL,
    ttsRestUrl,
    ttsSseUrl,
    ttsModel: GNANI_DEFAULT_TTS_MODEL,
    ttsDefaultVoice: GNANI_DEFAULT_TTS_VOICE,
  };
}

export function isGnaniConfigured(): boolean {
  return Boolean(getGnaniConfig().apiKey);
}

export function getGnaniPublicStatus() {
  return {
    configured: isGnaniConfigured(),
    model: GNANI_DEFAULT_STT_MODEL,
    sttModel: GNANI_DEFAULT_STT_MODEL,
    ttsModel: GNANI_DEFAULT_TTS_MODEL,
    defaultVoice: GNANI_DEFAULT_TTS_VOICE,
    voices: [...GNANI_TIMBRE_V3_VOICES],
    restPath: "/api/ai/gnani/transcribe",
    streamingPath: "/ws/gnani-stt",
    ttsPath: "/api/ai/gnani/tts",
    ttsSsePath: "/api/ai/gnani/tts/sse",
    usagePath: "/api/ai/gnani/usage",
  };
}

/**
 * Common static prompts used repeatedly in VOXONIX so they can be pre-cached
 * or served from server/client cache without redundant Gnani Timbre calls.
 */
export const STATIC_COMMON_PROMPTS = [
  "Welcome to VOXONIX.",
  "Opening settings.",
  "Opening dashboard.",
  "Opening profile.",
  "Opening home page.",
  "Opening registration.",
  "Opening sign in.",
  "Opening media test.",
  "Confirmed.",
  "Canceled.",
  "Microphone listening paused.",
  "Microphone listening resumed.",
  "Cleared name. Please say your full name again.",
  "Cleared email. Please say your email address again.",
  "Cleared password. Please speak your password again.",
  "Welcome to VOXONIX Blind registration. Step 2 of 5: Please say your full name.",
  "Step 2 of 5: What is your full name? Please say your full name.",
  "Step 3 of 5: Email address. Say your complete email, for example alex zero five at gmail dot com.",
  "Now please say your confirm password again to make sure both match.",
  "The passwords do not match. Please speak your password again.",
  "Step 5 of 5: Review and submit. Say confirm or submit to create your account.",
  "Submitting your VOXONIX registration now.",
  "Registration successful! Welcome to VOXONIX. Opening your personal communication dashboard.",
  "Sign in successful. Welcome to VOXONIX. Your dashboard is opening now.",
  "Are you sure you want to log out? Say confirm or cancel.",
  "Are you sure you want to end the call? Say confirm or cancel.",
] as const;

const SENSITIVE_TTS_PATTERN = /\b(?:password|passphrase|credential|secret|token|otp|cvv|ssn)\b/i;

export function isSensitiveTtsText(text: string): boolean {
  return SENSITIVE_TTS_PATTERN.test(text);
}

export function buildGnaniTtsCacheKey(input: {
  model?: string;
  voice: string;
  language: string;
  speed: number;
  sampleRate: number;
  text: string;
}): string {
  const payload = JSON.stringify({
    model: input.model || GNANI_DEFAULT_TTS_MODEL,
    voice: input.voice,
    language: input.language,
    speed: Number(input.speed.toFixed(2)),
    sampleRate: input.sampleRate,
    text: input.text,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

const MAX_SERVER_TTS_CACHE_ENTRIES = 128;
const serverTtsMemoryCache = new Map<string, Buffer>();

function getDiskCachePath(cacheKey: string): string {
  return path.join(process.cwd(), "data", "gnani-tts-cache", `${cacheKey}.wav`);
}

function shouldUseDiskTtsCache(): boolean {
  return process.env.NODE_ENV !== "test";
}

function readTtsCacheEntry(cacheKey: string): Buffer | null {
  const mem = serverTtsMemoryCache.get(cacheKey);
  if (mem) {
    // Refresh LRU order
    serverTtsMemoryCache.delete(cacheKey);
    serverTtsMemoryCache.set(cacheKey, mem);
    return mem;
  }

  if (shouldUseDiskTtsCache()) {
    try {
      const filePath = getDiskCachePath(cacheKey);
      if (fs.existsSync(filePath)) {
        const wav = fs.readFileSync(filePath);
        if (wav.length >= 44) {
          writeTtsMemoryEntry(cacheKey, wav);
          return wav;
        }
      }
    } catch {
      // Ignore unreadable cache files cleanly
    }
  }
  return null;
}

function writeTtsMemoryEntry(cacheKey: string, wav: Buffer): void {
  if (serverTtsMemoryCache.has(cacheKey)) {
    serverTtsMemoryCache.delete(cacheKey);
  }
  while (serverTtsMemoryCache.size >= MAX_SERVER_TTS_CACHE_ENTRIES) {
    const oldestKey = serverTtsMemoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    serverTtsMemoryCache.delete(oldestKey);
  }
  serverTtsMemoryCache.set(cacheKey, wav);
}

function writeTtsCacheEntry(cacheKey: string, wav: Buffer): void {
  writeTtsMemoryEntry(cacheKey, wav);
  if (shouldUseDiskTtsCache()) {
    try {
      const filePath = getDiskCachePath(cacheKey);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, wav);
    } catch {
      // Non-fatal disk cache failure
    }
  }
}

export function clearGnaniTtsCache(includeDisk = false): void {
  serverTtsMemoryCache.clear();
  if (includeDisk) {
    try {
      fs.rmSync(path.join(process.cwd(), "data", "gnani-tts-cache"), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export interface GnaniModelPurposeStats {
  requests: number;
  audioSeconds: number;
  characters: number;
  failures: number;
  retries: number;
  cacheHits: number;
}

export interface GnaniUsageSummary {
  sttRequests: number;
  sttTotalAudioSeconds: number;
  sttSkippedOrBlocked: number;
  ttsRequests: number;
  ttsTotalCharacters: number;
  ttsCacheHits: number;
  failedRequests: number;
  retries: number;
  cacheEntriesCount: number;
  byModelAndPurpose: Record<string, GnaniModelPurposeStats>;
  note: string;
}

const usageStats = {
  sttRequests: 0,
  sttTotalAudioSeconds: 0,
  sttSkippedOrBlocked: 0,
  ttsRequests: 0,
  ttsTotalCharacters: 0,
  ttsCacheHits: 0,
  failedRequests: 0,
  retries: 0,
  byModelAndPurpose: new Map<string, GnaniModelPurposeStats>(),
};

function getOrCreateBucket(model: string, purpose: string): GnaniModelPurposeStats {
  const safePurpose = purpose.trim().toLowerCase().slice(0, 48) || "general";
  const key = `${model}:${safePurpose}`;
  let existing = usageStats.byModelAndPurpose.get(key);
  if (!existing) {
    existing = {
      requests: 0,
      audioSeconds: 0,
      characters: 0,
      failures: 0,
      retries: 0,
      cacheHits: 0,
    };
    usageStats.byModelAndPurpose.set(key, existing);
  }
  return existing;
}

export function getGnaniUsageSummary(): GnaniUsageSummary {
  const byModelAndPurpose: Record<string, GnaniModelPurposeStats> = {};
  for (const [k, v] of usageStats.byModelAndPurpose.entries()) {
    byModelAndPurpose[k] = { ...v, audioSeconds: Number(v.audioSeconds.toFixed(3)) };
  }
  return {
    sttRequests: usageStats.sttRequests,
    sttTotalAudioSeconds: Number(usageStats.sttTotalAudioSeconds.toFixed(3)),
    sttSkippedOrBlocked: usageStats.sttSkippedOrBlocked,
    ttsRequests: usageStats.ttsRequests,
    ttsTotalCharacters: usageStats.ttsTotalCharacters,
    ttsCacheHits: usageStats.ttsCacheHits,
    failedRequests: usageStats.failedRequests,
    retries: usageStats.retries,
    cacheEntriesCount: serverTtsMemoryCache.size,
    byModelAndPurpose,
    note: "Raw technical telemetry only (no transcripts, audio bytes, passwords, or credit-conversion assumptions).",
  };
}

export function resetGnaniUsageSummary(): void {
  usageStats.sttRequests = 0;
  usageStats.sttTotalAudioSeconds = 0;
  usageStats.sttSkippedOrBlocked = 0;
  usageStats.ttsRequests = 0;
  usageStats.ttsTotalCharacters = 0;
  usageStats.ttsCacheHits = 0;
  usageStats.failedRequests = 0;
  usageStats.retries = 0;
  usageStats.byModelAndPurpose.clear();
}

/**
 * Authoritatively validates Gnani STT request purposes and enforces narrow bounds
 * on the restricted wake-word listener while allowing Blind registration fields
 * (name, email, password, confirm_password) to use Gnani Prisma v3.0 without logging secrets.
 */
export function validateGnaniSttRequest(input: {
  purpose?: unknown;
  registrationStep?: unknown;
  wavBytesLength?: number;
}): { normalizedPurpose: string } {
  const rawPurpose = typeof input.purpose === "string" ? input.purpose.trim().toLowerCase() : "";
  const normalizedPurpose = rawPurpose || "general";

  if (!ALLOWED_GNANI_STT_PURPOSES.has(normalizedPurpose as never)) {
    throw new GnaniValidationError(
      `Unsupported speech recognition purpose '${normalizedPurpose}'.`,
      400,
    );
  }

  const stepNum =
    input.registrationStep !== undefined && input.registrationStep !== null
      ? Number(input.registrationStep)
      : undefined;

  if (normalizedPurpose === "wake") {
    if (stepNum !== undefined && (!Number.isFinite(stepNum) || stepNum !== 1)) {
      throw new GnaniValidationError(
        "Restricted wake-word recognition is limited to pre-selection onboarding.",
        403,
      );
    }
    if (
      typeof input.wavBytesLength === "number" &&
      input.wavBytesLength > 44 + MAX_WAKE_PCM16_BYTES
    ) {
      throw new GnaniValidationError("Wake-word utterance exceeds maximum allowed duration.", 400);
    }
  } else if (normalizedPurpose === "onboarding_choice") {
    if (stepNum !== undefined && (!Number.isFinite(stepNum) || stepNum !== 1)) {
      throw new GnaniValidationError(
        "Onboarding register-or-sign-in selection is limited to landing onboarding.",
        403,
      );
    }
    if (
      typeof input.wavBytesLength === "number" &&
      input.wavBytesLength > 44 + MAX_ONBOARDING_CHOICE_PCM16_BYTES
    ) {
      throw new GnaniValidationError(
        "Onboarding choice utterance exceeds maximum allowed duration.",
        400,
      );
    }
  } else if (LOGIN_STT_PURPOSES.has(normalizedPurpose)) {
    if (stepNum !== undefined && Number.isFinite(stepNum)) {
      throw new GnaniValidationError(
        "Login speech recognition purposes cannot be used during registration.",
        403,
      );
    }
    if (
      typeof input.wavBytesLength === "number" &&
      input.wavBytesLength > 44 + MAX_GENERAL_PCM16_BYTES
    ) {
      throw new GnaniValidationError("Login speech segment exceeds maximum allowed duration.", 400);
    }
  } else if (
    typeof input.wavBytesLength === "number" &&
    input.wavBytesLength > 44 + MAX_GENERAL_PCM16_BYTES
  ) {
    throw new GnaniValidationError("Speech segment exceeds maximum allowed duration.", 400);
  }

  return { normalizedPurpose };
}

/**
 * Wraps raw signed 16-bit little-endian mono PCM frames in a standard 44-byte RIFF WAV container.
 */
export function encodePcm16ToWav(pcm16Bytes: Buffer, sampleRate = 16000): Buffer {
  const byteRate = sampleRate * 2;
  const wav = Buffer.alloc(44 + pcm16Bytes.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm16Bytes.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm16Bytes.length, 40);
  pcm16Bytes.copy(wav, 44);
  return wav;
}

export interface GnaniTranscribeRequest {
  wavBuffer: Buffer;
  languageCode?: string;
  format?: "transcribe" | "verbatim" | "codemix" | "transliterate";
  keyterms?: string[];
  speakerNames?: string[];
  purpose?: string;
  registrationStep?: number;
}

export interface GnaniTranscribeResult {
  transcript: string;
  model: string;
  detectedLanguageCode: string | null;
  requestId: string | null;
  processingTimeSec: number | null;
  endToEndLatencySec: number | null;
  serverLatencyMs: number;
}

let gnaniUpstreamMutex: Promise<void> = Promise.resolve();

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializes upstream Gnani requests and retries ONLY pre-execution 429 RATE_LIMITED
 * rejections (bounded to 2 retries). Never retries HTTP 200, non-429 4xx, 5xx, or timeouts.
 */
async function executeQueuedGnaniRequest<T>(
  executeFetch: () => Promise<Response>,
  parseSuccessResponse: (res: Response) => Promise<T>,
  errorPrefix: string,
  options?: {
    maxRateLimitRetries?: number;
    onRetry?: () => void;
  },
): Promise<T> {
  const maxRateLimitRetries = options?.maxRateLimitRetries ?? 2;
  let release!: () => void;
  const previous = gnaniUpstreamMutex;
  gnaniUpstreamMutex = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await executeFetch();
      if (response.status === 429 && attempt < maxRateLimitRetries) {
        options?.onRetry?.();
        await response.body?.cancel().catch(() => undefined);
        await delayMs(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`${errorPrefix} (${response.status}): ${errText.slice(0, 200)}`);
      }
      return await parseSuccessResponse(response);
    }
  } finally {
    // Brief cooldown lets api.vachana.ai clear its active-request lock before the next request starts.
    setTimeout(release, 85);
  }
}

function estimateWavDurationSeconds(wavBuffer: Buffer): number {
  if (wavBuffer.length <= 44) return 0;
  const headerRate =
    wavBuffer.length >= 32 && wavBuffer.subarray(0, 4).toString("ascii") === "RIFF"
      ? wavBuffer.readUInt32LE(28)
      : 0;
  const byteRate = headerRate >= 16000 && headerRate <= 192000 ? headerRate : 32000;
  return (wavBuffer.length - 44) / byteRate;
}

export async function transcribeWithGnaniRest(
  input: GnaniTranscribeRequest,
): Promise<GnaniTranscribeResult> {
  const { normalizedPurpose } = validateGnaniSttRequest({
    purpose: input.purpose,
    registrationStep: input.registrationStep,
    wavBytesLength: input.wavBuffer.length,
  });

  const config = getGnaniConfig();
  if (!config.apiKey) {
    usageStats.failedRequests++;
    throw new GnaniNotConfiguredError();
  }

  const audioCopy = new Uint8Array(input.wavBuffer.length);
  audioCopy.set(input.wavBuffer);
  const languageCode = (input.languageCode || "en-IN").trim();
  const isWake = normalizedPurpose === "wake";
  const isOnboardingChoice = normalizedPurpose === "onboarding_choice";
  const isPasswordCapture =
    normalizedPurpose === "password" ||
    normalizedPurpose === "password_spelling" ||
    normalizedPurpose === "confirm_password" ||
    normalizedPurpose === "confirm_password_spelling" ||
    normalizedPurpose === "login_password" ||
    normalizedPurpose === "login_password_spelling";
  const format = isWake || isOnboardingChoice ? "verbatim" : input.format || "transcribe";
  const purpose = normalizedPurpose;
  const bucket = getOrCreateBucket(config.sttModel, purpose);
  const audioSeconds = estimateWavDurationSeconds(input.wavBuffer);

  // Restrict wake listener strictly to "Blind", restrict onboarding choice strictly to Register/Sign in,
  // and never attach keyterm hint lists or speakers to password captures.
  const sanitizedKeyterms = isWake
    ? ["Blind"]
    : isOnboardingChoice
      ? [
          "register",
          "registration",
          "sign up",
          "create account",
          "sign in",
          "login",
          "log in",
          "existing account",
          "repeat",
          "cancel",
          "stop",
        ]
      : isPasswordCapture
        ? []
        : (input.keyterms || [])
            .map((k) => k.trim())
            .filter((k) => k.length > 0 && k.length <= 64)
            .slice(0, 200);

  const sanitizedSpeakers =
    isWake || isOnboardingChoice || isPasswordCapture
      ? []
      : (input.speakerNames || [])
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 64)
          .slice(0, 4);

  const buildForm = () => {
    const form = new FormData();
    form.append("audio_file", new Blob([audioCopy.buffer], { type: "audio/wav" }), "utterance.wav");
    form.append("model", config.sttModel);
    form.append("language_code", languageCode);
    form.append("format", format);
    if (sanitizedKeyterms.length > 0) {
      form.append("keyterms", JSON.stringify(sanitizedKeyterms));
    }
    if (sanitizedSpeakers.length > 0) {
      form.append("speaker_names", JSON.stringify(sanitizedSpeakers));
    }
    return form;
  };

  let t0 = performance.now();
  try {
    return await executeQueuedGnaniRequest(
      () => {
        t0 = performance.now();
        usageStats.sttRequests++;
        usageStats.sttTotalAudioSeconds += audioSeconds;
        bucket.requests++;
        bucket.audioSeconds += audioSeconds;
        return fetch(config.sttRestUrl, {
          method: "POST",
          headers: {
            "X-API-Key-ID": config.apiKey,
          },
          body: buildForm(),
          signal: AbortSignal.timeout(12_000),
        });
      },
      async (response) => {
        const serverLatencyMs = Math.round(performance.now() - t0);
        const rawText = await response.text();
        const parsed = JSON.parse(rawText) as {
          transcript?: string;
          text?: string;
          model?: string;
          request_id?: string;
          detected_language_code?: string;
          processing_time?: number;
          end_to_end_latency?: number;
        };

        return {
          transcript: (parsed.transcript || parsed.text || "").trim(),
          model: parsed.model || config.sttModel,
          detectedLanguageCode: parsed.detected_language_code || null,
          requestId: parsed.request_id || null,
          processingTimeSec:
            typeof parsed.processing_time === "number" ? parsed.processing_time : null,
          endToEndLatencySec:
            typeof parsed.end_to_end_latency === "number" ? parsed.end_to_end_latency : null,
          serverLatencyMs,
        };
      },
      "Gnani STT upstream error",
      {
        maxRateLimitRetries: 2,
        onRetry: () => {
          usageStats.retries++;
          bucket.retries++;
        },
      },
    );
  } catch (err) {
    usageStats.failedRequests++;
    bucket.failures++;
    throw err;
  }
}

export interface GnaniSynthesizeRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  sampleRate?: number;
}

export function normalizeTimbreVoice(voice?: string): GnaniTimbreVoice {
  if (!voice) return GNANI_DEFAULT_TTS_VOICE;
  const trimmed = voice.trim();
  const found = GNANI_TIMBRE_V3_VOICES.find((v) => v.toLowerCase() === trimmed.toLowerCase());
  return found ?? GNANI_DEFAULT_TTS_VOICE;
}

export function sanitizeTtsText(text: string): string {
  let stripped = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      stripped += text[i];
    } else {
      stripped += " ";
    }
  }
  return stripped.replace(/\s+/g, " ").trim().slice(0, 1500);
}

/**
 * Synthesizes speech audio (WAV bytes) via Gnani Timbre v3.0 REST API (`POST /api/v1/tts/inference`)
 * with privacy-safe caching for non-sensitive prompts and telemetry tracking.
 */
export async function synthesizeWithGnaniTtsRestDetailed(
  input: GnaniSynthesizeRequest & { purpose?: string },
): Promise<{ wav: Buffer; cacheHit: boolean; cacheKey: string | null }> {
  const cleanedText = sanitizeTtsText(input.text);
  if (!cleanedText) {
    throw new Error("Text is required for Gnani Timbre TTS synthesis.");
  }

  const config = getGnaniConfig();
  const voice = normalizeTimbreVoice(input.voice);
  const language = (input.language || "en-IN").trim() || "en-IN";
  const rawSpeed = typeof input.speed === "number" ? input.speed : 1.0;
  const speed = Math.max(0.6, Math.min(1.6, Number.isFinite(rawSpeed) ? rawSpeed : 1.0));
  const rawSr = typeof input.sampleRate === "number" ? input.sampleRate : 24000;
  const sampleRate = rawSr === 16000 || rawSr === 24000 || rawSr === 48000 ? rawSr : 24000;

  const bucket = getOrCreateBucket(config.ttsModel, input.purpose || "tts");
  const sensitive = isSensitiveTtsText(cleanedText);
  const cacheKey = sensitive
    ? null
    : buildGnaniTtsCacheKey({
        model: config.ttsModel,
        voice,
        language,
        speed,
        sampleRate,
        text: cleanedText,
      });

  if (cacheKey) {
    const cachedWav = readTtsCacheEntry(cacheKey);
    if (cachedWav) {
      usageStats.ttsCacheHits++;
      bucket.cacheHits++;
      return { wav: cachedWav, cacheHit: true, cacheKey };
    }
  }

  if (!config.apiKey) {
    usageStats.failedRequests++;
    bucket.failures++;
    throw new GnaniNotConfiguredError();
  }

  const payload = JSON.stringify({
    text: cleanedText,
    voice,
    model: config.ttsModel,
    language,
    speed,
    audio_config: {
      encoding: "linear_pcm",
      container: "wav",
      num_channels: 1,
      sample_rate: sampleRate,
      sample_width: 2,
    },
  });

  try {
    const wav = await executeQueuedGnaniRequest(
      () => {
        usageStats.ttsRequests++;
        usageStats.ttsTotalCharacters += cleanedText.length;
        bucket.requests++;
        bucket.characters += cleanedText.length;
        return fetch(config.ttsRestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key-ID": config.apiKey,
          },
          body: payload,
          signal: AbortSignal.timeout(15_000),
        });
      },
      async (response) => {
        const arrayBuffer = await response.arrayBuffer();
        const wavBytes = Buffer.from(arrayBuffer);
        if (wavBytes.length < 44) {
          throw new Error("Gnani Timbre TTS returned empty audio payload.");
        }
        return wavBytes;
      },
      "Gnani Timbre TTS upstream error",
      {
        maxRateLimitRetries: 2,
        onRetry: () => {
          usageStats.retries++;
          bucket.retries++;
        },
      },
    );

    if (cacheKey) {
      writeTtsCacheEntry(cacheKey, wav);
    }
    return { wav, cacheHit: false, cacheKey };
  } catch (err) {
    usageStats.failedRequests++;
    bucket.failures++;
    throw err;
  }
}

/**
 * Synthesizes speech audio (WAV bytes) via Gnani Timbre v3.0 REST API (`POST /api/v1/tts/inference`).
 */
export async function synthesizeWithGnaniTtsRest(input: GnaniSynthesizeRequest): Promise<Buffer> {
  const { wav } = await synthesizeWithGnaniTtsRestDetailed(input);
  return wav;
}

/**
 * Explicit opt-in helper to pre-populate static common prompts on disk/memory before a demo.
 * Never executed automatically on server boot or tests.
 */
export async function pregenerateStaticPrompts(options?: {
  voice?: string;
  language?: string;
  speed?: number;
  sampleRate?: number;
  prompts?: readonly string[];
}): Promise<{ total: number; cached: number; synthesized: number }> {
  const prompts = options?.prompts || STATIC_COMMON_PROMPTS;
  let cached = 0;
  let synthesized = 0;
  for (const text of prompts) {
    const res = await synthesizeWithGnaniTtsRestDetailed({
      text,
      voice: options?.voice || GNANI_DEFAULT_TTS_VOICE,
      language: options?.language || "en-IN",
      speed: options?.speed ?? 1.0,
      sampleRate: options?.sampleRate ?? 24000,
      purpose: "pregenerate",
    });
    if (res.cacheHit) cached++;
    else synthesized++;
  }
  return { total: prompts.length, cached, synthesized };
}

/**
 * Proxies Gnani Timbre v3.0 SSE streaming synthesis (`POST /api/v1/tts/sse`).
 */
export async function fetchGnaniTtsSseStream(input: GnaniSynthesizeRequest): Promise<Response> {
  const config = getGnaniConfig();
  if (!config.apiKey) {
    usageStats.failedRequests++;
    throw new GnaniNotConfiguredError();
  }

  const cleanedText = sanitizeTtsText(input.text);
  if (!cleanedText) {
    throw new Error("Text is required for Gnani Timbre TTS streaming.");
  }

  const voice = normalizeTimbreVoice(input.voice);
  const language = (input.language || "en-IN").trim() || "en-IN";
  const rawSpeed = typeof input.speed === "number" ? input.speed : 1.0;
  const speed = Math.max(0.6, Math.min(1.6, Number.isFinite(rawSpeed) ? rawSpeed : 1.0));
  const bucket = getOrCreateBucket(config.ttsModel, "tts-sse");
  const payload = JSON.stringify({
    text: cleanedText,
    voice,
    model: config.ttsModel,
    language,
    speed,
    audio_config: {
      encoding: "linear_pcm",
      container: "wav",
      num_channels: 1,
      sample_rate: 16000,
      sample_width: 2,
    },
  });

  try {
    return await executeQueuedGnaniRequest(
      () => {
        usageStats.ttsRequests++;
        usageStats.ttsTotalCharacters += cleanedText.length;
        bucket.requests++;
        bucket.characters += cleanedText.length;
        return fetch(config.ttsSseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key-ID": config.apiKey,
          },
          body: payload,
          signal: AbortSignal.timeout(20_000),
        });
      },
      async (upstream) => upstream,
      "Gnani Timbre SSE upstream error",
      {
        maxRateLimitRetries: 2,
        onRetry: () => {
          usageStats.retries++;
          bucket.retries++;
        },
      },
    );
  } catch (err) {
    usageStats.failedRequests++;
    bucket.failures++;
    throw err;
  }
}

interface GnaniSttHttpPayload {
  audioPcm16Base64?: string;
  wavBase64?: string;
  sampleRate?: number;
  languageCode?: string;
  format?: "transcribe" | "verbatim" | "codemix" | "transliterate";
  keyterms?: string[];
  speakerNames?: string[];
  purpose?: string;
  registrationStep?: number;
}

interface GnaniTtsHttpPayload {
  text?: string;
  voice?: string;
  language?: string;
  speed?: number;
  sampleRate?: number;
}

function parseNodeJsonBody<T>(req: IncomingMessage, maxBytes = 2_500_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function checkSameOriginHeaders(headers: {
  secFetchSite?: string | null;
  origin?: string | null;
}): boolean {
  if (headers.secFetchSite === "cross-site") return false;
  if (headers.origin === "null") return false;
  return true;
}

async function processTranscribePayload(body: GnaniSttHttpPayload): Promise<{
  status: number;
  data: unknown;
}> {
  const sampleRate =
    typeof body.sampleRate === "number" && body.sampleRate >= 8000 && body.sampleRate <= 48000
      ? Math.round(body.sampleRate)
      : 16000;

  let wavBuffer: Buffer | null = null;
  if (typeof body.wavBase64 === "string" && body.wavBase64.length > 0) {
    wavBuffer = Buffer.from(body.wavBase64, "base64");
  } else if (typeof body.audioPcm16Base64 === "string" && body.audioPcm16Base64.length > 0) {
    const pcm = Buffer.from(body.audioPcm16Base64, "base64");
    wavBuffer = encodePcm16ToWav(pcm, sampleRate);
    pcm.fill(0);
  }

  if (!wavBuffer || wavBuffer.length < 44) {
    return { status: 400, data: { error: "Valid WAV or PCM16 audio payload is required." } };
  }

  try {
    const result = await transcribeWithGnaniRest({
      wavBuffer,
      languageCode: body.languageCode,
      format: body.format,
      keyterms: Array.isArray(body.keyterms) ? body.keyterms : undefined,
      speakerNames: Array.isArray(body.speakerNames) ? body.speakerNames : undefined,
      purpose: body.purpose,
      registrationStep: body.registrationStep,
    });

    return { status: 200, data: result };
  } finally {
    wavBuffer.fill(0);
  }
}

function isUsageEndpointAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_GNANI_USAGE_ENDPOINT === "1";
}

/**
 * Node HTTP / Vite Connect middleware handling all `/api/ai/gnani/*` routes.
 */
export async function gnaniMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const urlPath = (req.url || "").split("?")[0];

  if (urlPath === "/api/ai/gnani/status" && req.method === "GET") {
    sendJson(res, 200, getGnaniPublicStatus());
    return;
  }

  if (urlPath === "/api/ai/gnani/usage" && req.method === "GET") {
    if (!isUsageEndpointAllowed()) {
      sendJson(res, 403, { error: "Developer usage summary is disabled in production." });
      return;
    }
    sendJson(res, 200, getGnaniUsageSummary());
    return;
  }

  if (urlPath === "/api/ai/gnani/transcribe") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return;
    }
    if (
      !checkSameOriginHeaders({
        secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
        origin: req.headers["origin"] as string | undefined,
      })
    ) {
      sendJson(res, 403, { error: "Cross-site Gnani request blocked." });
      return;
    }

    try {
      const body = await parseNodeJsonBody<GnaniSttHttpPayload>(req);
      const outcome = await processTranscribePayload(body);
      sendJson(res, outcome.status, outcome.data);
    } catch (err: unknown) {
      if (err instanceof GnaniValidationError) {
        sendJson(res, err.statusCode, { error: err.message });
        return;
      }
      if (err instanceof GnaniNotConfiguredError) {
        sendJson(res, 503, { error: err.message });
        return;
      }
      sendJson(res, 502, {
        error: err instanceof Error ? err.message : "Gnani transcription failed",
      });
    }
    return;
  }

  if (urlPath === "/api/ai/gnani/tts") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const body = await parseNodeJsonBody<GnaniTtsHttpPayload>(req, 64_000);
      const text = sanitizeTtsText(body.text || "");
      if (!text) {
        sendJson(res, 400, { error: "Text is required for speech synthesis." });
        return;
      }

      const { wav, cacheHit } = await synthesizeWithGnaniTtsRestDetailed({
        text,
        voice: body.voice,
        language: body.language,
        speed: body.speed,
        sampleRate: body.sampleRate,
        purpose: "tts",
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", String(wav.length));
      res.setHeader("X-Voxonix-TTS-Cache", cacheHit ? "HIT" : "MISS");
      res.setHeader("Cache-Control", "no-store");
      res.end(wav);
    } catch (err: unknown) {
      if (err instanceof GnaniNotConfiguredError) {
        sendJson(res, 503, { error: err.message });
        return;
      }
      sendJson(res, 502, {
        error: err instanceof Error ? err.message : "Gnani Timbre TTS failed",
      });
    }
    return;
  }

  if (urlPath === "/api/ai/gnani/tts/sse") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const body = await parseNodeJsonBody<GnaniTtsHttpPayload>(req, 64_000);
      const text = sanitizeTtsText(body.text || "");
      if (!text) {
        sendJson(res, 400, { error: "Text is required for streaming speech synthesis." });
        return;
      }

      const upstream = await fetchGnaniTtsSseStream({
        text,
        voice: body.voice,
        language: body.language,
        speed: body.speed,
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");

      if (upstream.body) {
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } catch (err: unknown) {
      if (err instanceof GnaniNotConfiguredError) {
        sendJson(res, 503, { error: err.message });
        return;
      }
      sendJson(res, 502, {
        error: err instanceof Error ? err.message : "Gnani Timbre SSE failed",
      });
    }
    return;
  }

  next();
}

/**
 * Web Fetch API handler for `/api/ai/gnani/*` routes in SSR runtimes (`src/server.ts`).
 */
export async function handleGnaniFetchRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const urlPath = url.pathname;

  if (urlPath === "/api/ai/gnani/status" && request.method === "GET") {
    return new Response(JSON.stringify(getGnaniPublicStatus()), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (urlPath === "/api/ai/gnani/usage" && request.method === "GET") {
    if (!isUsageEndpointAllowed()) {
      return new Response(
        JSON.stringify({ error: "Developer usage summary is disabled in production." }),
        { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
    return new Response(JSON.stringify(getGnaniUsageSummary()), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (urlPath === "/api/ai/gnani/transcribe") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    if (
      !checkSameOriginHeaders({
        secFetchSite: request.headers.get("sec-fetch-site"),
        origin: request.headers.get("origin"),
      })
    ) {
      return new Response(JSON.stringify({ error: "Cross-site Gnani request blocked." }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    try {
      const body = (await request.json()) as GnaniSttHttpPayload;
      const outcome = await processTranscribePayload(body);
      return new Response(JSON.stringify(outcome.data), {
        status: outcome.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (err: unknown) {
      const status =
        err instanceof GnaniValidationError
          ? err.statusCode
          : err instanceof GnaniNotConfiguredError
            ? 503
            : 502;
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Gnani transcription failed",
        }),
        { status, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
  }

  if (urlPath === "/api/ai/gnani/tts") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    try {
      const body = (await request.json()) as GnaniTtsHttpPayload;
      const text = sanitizeTtsText(body.text || "");
      if (!text) {
        return new Response(JSON.stringify({ error: "Text is required for speech synthesis." }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const { wav, cacheHit } = await synthesizeWithGnaniTtsRestDetailed({
        text,
        voice: body.voice,
        language: body.language,
        speed: body.speed,
        sampleRate: body.sampleRate,
        purpose: "tts",
      });
      return new Response(new Uint8Array(wav), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-Voxonix-TTS-Cache": cacheHit ? "HIT" : "MISS",
          "Cache-Control": "no-store",
        },
      });
    } catch (err: unknown) {
      const status = err instanceof GnaniNotConfiguredError ? 503 : 502;
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Gnani Timbre TTS failed",
        }),
        { status, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
  }

  if (urlPath === "/api/ai/gnani/tts/sse") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    try {
      const body = (await request.json()) as GnaniTtsHttpPayload;
      const text = sanitizeTtsText(body.text || "");
      if (!text) {
        return new Response(JSON.stringify({ error: "Text is required." }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const upstream = await fetchGnaniTtsSseStream({
        text,
        voice: body.voice,
        language: body.language,
        speed: body.speed,
      });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (err: unknown) {
      const status = err instanceof GnaniNotConfiguredError ? 503 : 502;
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Gnani Timbre SSE failed",
        }),
        { status, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
  }

  return new Response(JSON.stringify({ error: "Gnani AI endpoint not found." }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

interface UpgradeableServer {
  on(
    event: "upgrade",
    listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): void;
}

/**
 * Attaches `/ws/gnani-stt` WebSocket proxy forwarding authenticated non-sensitive browser PCM streams
 * to Gnani `wss://api.vachana.ai/stt/v3/stream` with server-side `x-api-key-id`.
 */
export function attachGnaniWebSocketProxy(server: UpgradeableServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const parsedUrl = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (parsedUrl.pathname === "/ws/gnani-stt" || parsedUrl.pathname === "/ws/gnani-stt/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (clientWs: WebSocket, request?: IncomingMessage) => {
    const parsedUrl = new URL(
      request?.url || "",
      `http://${request?.headers?.host || "localhost"}`,
    );
    const purpose = parsedUrl.searchParams.get("purpose") || "dictation";
    const registrationStep = parsedUrl.searchParams.get("step") || undefined;
    const languageCode = parsedUrl.searchParams.get("lang") || "en-IN";
    const format = parsedUrl.searchParams.get("format") || "transcribe";

    try {
      validateGnaniSttRequest({ purpose, registrationStep });
    } catch (err: unknown) {
      usageStats.sttSkippedOrBlocked++;
      clientWs.close(4403, err instanceof Error ? err.message : "Invalid Gnani streaming request.");
      return;
    }

    const config = getGnaniConfig();
    if (!config.apiKey) {
      usageStats.failedRequests++;
      clientWs.close(4503, "Gnani STT API key is not configured.");
      return;
    }

    const wsBucket = getOrCreateBucket(config.sttModel, `ws:${purpose}`);
    usageStats.sttRequests++;
    wsBucket.requests++;

    const upstreamWs = new WebSocket(config.sttWsUrl, {
      headers: {
        "x-api-key-id": config.apiKey,
        model: config.sttModel,
        language_code: languageCode,
        format,
        "x-sample-rate": "16000",
      },
    });

    const pendingFrames: Buffer[] = [];

    upstreamWs.on("open", () => {
      while (pendingFrames.length > 0 && upstreamWs.readyState === WebSocket.OPEN) {
        const frame = pendingFrames.shift();
        if (frame) upstreamWs.send(frame);
      }
    });

    upstreamWs.on("message", (data: WebSocket.RawData) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(typeof data === "string" ? data : data.toString("utf-8"));
      }
    });

    upstreamWs.on("close", (code, reason) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code >= 1000 && code <= 4999 ? code : 1000, reason?.toString() || "");
      }
    });

    upstreamWs.on("error", (err) => {
      console.warn("[GnaniWSProxy] Upstream error:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: "Upstream Gnani STT error" }));
        clientWs.close(1011, "Upstream Gnani error");
      }
    });

    clientWs.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString("utf-8");
        try {
          const parsed = JSON.parse(text) as { purpose?: string; registrationStep?: number };
          validateGnaniSttRequest(parsed);
        } catch (err: unknown) {
          if (err instanceof GnaniValidationError) {
            upstreamWs.close();
            clientWs.close(4403, err.message);
            return;
          }
          // Ignore non-JSON control text
        }
        return;
      }

      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);

      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(buf);
      } else if (upstreamWs.readyState === WebSocket.CONNECTING && pendingFrames.length < 512) {
        pendingFrames.push(buf);
      }
    });

    clientWs.on("close", () => {
      if (
        upstreamWs.readyState === WebSocket.OPEN ||
        upstreamWs.readyState === WebSocket.CONNECTING
      ) {
        upstreamWs.close();
      }
    });
  });

  return wss;
}
