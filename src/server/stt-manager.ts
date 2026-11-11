import { WebSocket } from "ws";
import { getServerConfig } from "../lib/config.server";
import type { CaptionPayload } from "../lib/webrtc/signaling-protocol";

export type STTProviderType = "deepgram" | "mock" | "browser-fallback";

export type STTSessionState = "connecting" | "active" | "reconnecting" | "failed" | "closed";

export interface STTSessionCallbacks {
  onCaption: (caption: CaptionPayload) => void;
  onStateChange: (state: "active" | "reconnecting" | "failed" | "closed", message?: string) => void;
}

export interface ISTTSession {
  feedAudio(chunk: Buffer): void;
  stop(): void;
  getState(): STTSessionState;
}

/**
 * DeepgramStreamingSession
 *
 * Manages an individual real-time bi-directional streaming WebSocket to Deepgram's
 * Nova-3 speech-to-text API.
 *
 * Deepgram transcript model:
 * - is_final=true indicates a segment is finalized.
 * - speech_final=true indicates endpointing detected the end of the spoken sentence/utterance.
 * - Finalized segments are accumulated into committedTranscript until speech_final=true,
 *   preserving complete sentences in one coherent utterance rather than splitting them into
 *   premature fragments.
 */
export class DeepgramStreamingSession implements ISTTSession {
  private ws: WebSocket | null = null;
  private state: STTSessionState = "connecting";
  private isClosed = false;
  private currentUtteranceId = "";
  private currentRevision = 0;
  private committedTranscript = "";
  private audioBufferQueue: Buffer[] = [];
  private readonly maxQueueLength = 50; // Maximum ~4 seconds buffer during connection phase

  constructor(
    private readonly peerId: string,
    private readonly displayName: string,
    private readonly roomId: string,
    private readonly mimeType: string,
    private readonly language: string = "en-US",
    private readonly apiKey: string,
    private readonly model: string = "nova-3",
    private readonly callbacks: STTSessionCallbacks,
  ) {
    this.currentUtteranceId = `dg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.connect();
  }

  public getState(): STTSessionState {
    return this.state;
  }

  private connect() {
    try {
      const url = new URL("wss://api.deepgram.com/v1/listen");
      url.searchParams.set("model", this.model);
      url.searchParams.set("smart_format", "true");
      url.searchParams.set("interim_results", "true");
      url.searchParams.set("endpointing", "300"); // 300ms conversational endpointing
      url.searchParams.set("language", this.language);

      // Deepgram WebSocket connection with token auth header (Key strictly server-side)
      this.ws = new WebSocket(url.toString(), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        if (this.isClosed) {
          this.ws?.close();
          return;
        }
        this.state = "active";
        this.callbacks.onStateChange("active");
        console.log(
          `[DeepgramSTT] Session active for peer=${this.peerId} (${this.displayName}) room=${this.roomId} model=${this.model}`,
        );

        // Flush bounded buffered audio chunks queued during connection handshake
        while (this.audioBufferQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
          const chunk = this.audioBufferQueue.shift();
          if (chunk) {
            this.ws.send(chunk);
          }
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        if (this.isClosed) return;
        try {
          const messageStr = typeof data === "string" ? data : data.toString("utf-8");
          const parsed = JSON.parse(messageStr);

          // Deepgram Results Payload handler
          if (parsed.type === "Results" || parsed.channel) {
            const alternative = parsed.channel?.alternatives?.[0];
            const transcriptText = alternative?.transcript?.trim();
            if (!transcriptText && !parsed.speech_final) return;

            const isFinalSegment = Boolean(parsed.is_final);
            const isSpeechFinal = Boolean(parsed.speech_final);

            let fullUtteranceText = "";

            if (isFinalSegment && transcriptText) {
              // Accumulate finalized segment into committed transcript for this utterance
              this.committedTranscript = this.committedTranscript
                ? `${this.committedTranscript} ${transcriptText}`
                : transcriptText;
              fullUtteranceText = this.committedTranscript;
            } else if (transcriptText) {
              // Interim result: combine already-committed segments with current interim hypothesis
              fullUtteranceText = this.committedTranscript
                ? `${this.committedTranscript} ${transcriptText}`
                : transcriptText;
            } else {
              fullUtteranceText = this.committedTranscript;
            }

            if (!fullUtteranceText) return;

            this.currentRevision++;
            const now = Date.now();

            const caption: CaptionPayload = {
              captionId: `c_${this.currentUtteranceId}_${this.currentRevision}`,
              utteranceId: this.currentUtteranceId,
              revision: this.currentRevision,
              speakerPeerId: this.peerId, // Authenticated peer ID (server-assigned)
              speakerDisplayName: this.displayName, // Authenticated display name (server-assigned)
              text: fullUtteranceText,
              isFinal: isSpeechFinal, // Only true when endpointing detects speech_final
              timestamp: now,
              clientSentAt: now,
              serverReceivedAt: now,
              serverSentAt: now,
              language: this.language,
            };

            this.callbacks.onCaption(caption);

            if (isSpeechFinal) {
              // Complete utterance boundary reached: rotate utterance ID and reset accumulator
              this.currentUtteranceId = `dg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              this.committedTranscript = "";
              this.currentRevision = 0;
            }
          }
        } catch (err) {
          console.warn("[DeepgramSTT] Error parsing Deepgram message:", err);
        }
      });

      this.ws.on("error", (err) => {
        console.warn(`[DeepgramSTT] WebSocket error for peer=${this.peerId}:`, err.message);
        this.state = "failed";
        this.callbacks.onStateChange("failed", err.message);
      });

      this.ws.on("close", (code, reason) => {
        console.log(
          `[DeepgramSTT] WebSocket closed for peer=${this.peerId} code=${code} reason=${reason.toString()}`,
        );
        this.state = "closed";
        if (!this.isClosed) {
          this.callbacks.onStateChange("closed");
        }
      });
    } catch (err) {
      console.warn("[DeepgramSTT] Exception initiating session:", err);
      this.state = "failed";
      this.callbacks.onStateChange(
        "failed",
        err instanceof Error ? err.message : "Unknown connection error",
      );
    }
  }

  public feedAudio(chunk: Buffer): void {
    if (this.isClosed) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Check backpressure on active WebSocket
      if (this.ws.bufferedAmount > 1024 * 1024) {
        console.warn(
          `[DeepgramSTT] Upstream backpressure detected (bufferedAmount=${this.ws.bufferedAmount} bytes)`,
        );
      }
      this.ws.send(chunk);
    } else if (this.state === "connecting") {
      if (this.audioBufferQueue.length < this.maxQueueLength) {
        this.audioBufferQueue.push(chunk);
      } else {
        // Buffer saturated while still connecting -> transition to failed/reconnecting rather than silently dropping audio
        console.warn(
          `[DeepgramSTT] Initial audio queue capacity exceeded (${this.maxQueueLength} chunks) for peer=${this.peerId}`,
        );
        this.state = "failed";
        this.callbacks.onStateChange("failed", "STT connection handshake buffer overflow");
        this.stop();
      }
    }
  }

  public stop(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.state = "closed";
    this.audioBufferQueue = [];

    if (this.ws) {
      try {
        // Send close stream payload if open for clean provider shutdown
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}

/**
 * STTManager
 *
 * Dedicated server-side service responsible for managing active STT sessions,
 * decoupling recognition provider lifecycles from WebRTC room signaling.
 */
export class STTManager {
  private activeSessions = new Map<string, ISTTSession>();

  public getCapabilities(): {
    available: boolean;
    provider: STTProviderType;
    model?: string;
  } {
    const config = getServerConfig();
    if (config.deepgramApiKey && config.deepgramApiKey.trim().length > 0) {
      return {
        available: true,
        provider: "deepgram",
        model: config.deepgramModel,
      };
    }
    return {
      available: false,
      provider: "browser-fallback",
    };
  }

  public startSession(
    peerId: string,
    displayName: string,
    roomId: string,
    mimeType: string,
    language = "en-US",
    callbacks: STTSessionCallbacks,
  ): boolean {
    // Invariant: Stop any existing session for this peer first (guarantee strictly 1 session per peer)
    this.stopSession(peerId);

    const config = getServerConfig();
    const apiKey = config.deepgramApiKey;

    if (!apiKey || apiKey.trim().length === 0) {
      console.log(`[STTManager] No DEEPGRAM_API_KEY configured. Falling back to browser STT.`);
      callbacks.onStateChange("failed", "No server STT API key configured");
      return false;
    }

    try {
      const session = new DeepgramStreamingSession(
        peerId,
        displayName,
        roomId,
        mimeType,
        language,
        apiKey,
        config.deepgramModel || "nova-3",
        callbacks,
      );
      this.activeSessions.set(peerId, session);
      return true;
    } catch (err) {
      console.warn(`[STTManager] Failed to start STT session for peer=${peerId}:`, err);
      callbacks.onStateChange("failed", String(err));
      return false;
    }
  }

  public feedAudioChunk(peerId: string, chunk: Buffer): void {
    const session = this.activeSessions.get(peerId);
    if (session) {
      session.feedAudio(chunk);
    }
  }

  public stopSession(peerId: string): void {
    const existing = this.activeSessions.get(peerId);
    if (existing) {
      existing.stop();
      this.activeSessions.delete(peerId);
      console.log(`[STTManager] Stopped STT session for peer=${peerId}`);
    }
  }

  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }
}

// Global server STTManager singleton
export const sttManager = new STTManager();
