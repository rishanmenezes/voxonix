import type {
  SignalMessage,
  SignalingState,
  RemotePeerInfo,
  CaptionPayload,
} from "./signaling-protocol";

export type SignalingCallbacks = {
  onStatusChange?: (status: SignalingState) => void;
  onRoomJoined?: (data: {
    roomId: string;
    peerId: string;
    peersCount: number;
    existingPeers: RemotePeerInfo[];
    displayName?: string;
  }) => void;
  onPeerJoined?: (data: { peerId: string; displayName?: string; peersCount: number }) => void;
  onOffer?: (data: { from: string; to: string; sdp: RTCSessionDescriptionInit }) => void;
  onAnswer?: (data: { from: string; to: string; sdp: RTCSessionDescriptionInit }) => void;
  onIceCandidate?: (data: { from: string; to: string; candidate: RTCIceCandidateInit }) => void;
  onPeerLeft?: (data: { peerId: string; peersCount: number }) => void;
  onRoomFull?: (data: { message: string }) => void;
  onError?: (data: { message: string }) => void;
  onMediaState?: (data: { from: string; videoEnabled: boolean; audioEnabled: boolean }) => void;
  onCaption?: (caption: CaptionPayload) => void;
  onSTTCapabilities?: (data: {
    available: boolean;
    provider: "deepgram" | "mock" | "browser-fallback";
    model?: string;
  }) => void;
  onSTTState?: (data: {
    state: "active" | "reconnecting" | "failed" | "closed";
    message?: string;
  }) => void;
};

type CaptionListener = NonNullable<SignalingCallbacks["onCaption"]>;
type STTCapabilitiesListener = NonNullable<SignalingCallbacks["onSTTCapabilities"]>;
type STTStateListener = NonNullable<SignalingCallbacks["onSTTState"]>;

export class SignalingBroker {
  private ws: WebSocket | null = null;
  private peerId: string;
  private displayName: string | undefined;
  private authToken: string | undefined;
  private roomId: string | null = null;
  private peersCount: number = 0;
  private status: SignalingState = "disconnected";
  private callbacks: SignalingCallbacks = {};
  private captionListeners = new Set<CaptionListener>();
  private sttCapabilitiesListeners = new Set<STTCapabilitiesListener>();
  private sttStateListeners = new Set<STTStateListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = true;

  constructor(
    peerId: string,
    callbacks: SignalingCallbacks = {},
    displayName?: string,
    authToken?: string,
  ) {
    this.peerId = peerId;
    this.callbacks = callbacks;
    this.displayName = displayName;
    this.authToken = authToken;
  }

  public setAuthToken(token: string | undefined): void {
    this.authToken = token;
  }

  public setCallbacks(callbacks: SignalingCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Subscribe to captions without replacing the primary caption callback.
   * The returned disposer is safe to call more than once.
   */
  public addCaptionListener(listener: CaptionListener): () => void {
    this.captionListeners.add(listener);
    return () => this.captionListeners.delete(listener);
  }

  /** Subscribe to server STT capability messages without replacing callbacks. */
  public addSTTCapabilitiesListener(listener: STTCapabilitiesListener): () => void {
    this.sttCapabilitiesListeners.add(listener);
    return () => this.sttCapabilitiesListeners.delete(listener);
  }

  /** Subscribe to server STT state messages without replacing callbacks. */
  public addSTTStateListener(listener: STTStateListener): () => void {
    this.sttStateListeners.add(listener);
    return () => this.sttStateListeners.delete(listener);
  }

  public getStatus(): SignalingState {
    return this.status;
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getRoomId(): string | null {
    return this.roomId;
  }

  public getPeersCount(): number {
    return this.peersCount;
  }

  private setStatus(newStatus: SignalingState): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatusChange?.(newStatus);
    }
  }

  public connect(wsUrl?: string): void {
    if (typeof window === "undefined") return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus(
      this.status === "error" || this.status === "disconnected" ? "connecting" : "reconnecting",
    );

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const configuredUrl =
      typeof import.meta.env.VITE_SIGNALING_URL === "string"
        ? import.meta.env.VITE_SIGNALING_URL.trim()
        : "";
    const targetUrl = wsUrl || configuredUrl || `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        this.setStatus("connected");
        // Auto re-join room if reconnecting
        if (this.roomId) {
          this.send({
            type: "join",
            roomId: this.roomId,
            peerId: this.peerId,
            displayName: this.displayName,
            authToken: this.authToken,
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: SignalMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.warn("[Signaling] Invalid message from signaling server:", err);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.setStatus("disconnected");
        if (event.code === 4401 || event.reason === "Unauthorized") {
          console.warn(
            "[Signaling] Connection rejected by server (Unauthorized 4401). Disabling reconnect.",
          );
          this.shouldReconnect = false;
          return;
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.setStatus("error");
        this.callbacks.onError?.({ message: "WebSocket connection error" });
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus("error");
      this.callbacks.onError?.({ message: `Failed to open WebSocket: ${msg}` });
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, 2000);
  }

  private handleMessage(msg: SignalMessage): void {
    // Keep auth tokens and conversation text out of browser console logs.
    console.log("[Signaling] Received:", msg.type);
    switch (msg.type) {
      case "joined": {
        this.roomId = msg.roomId;
        this.peersCount = msg.peersCount;
        this.callbacks.onRoomJoined?.(msg);
        break;
      }

      case "peer-joined": {
        this.peersCount = msg.peersCount;
        this.callbacks.onPeerJoined?.(msg);
        break;
      }

      case "offer": {
        if (msg.to !== this.peerId) {
          console.warn(`[Signaling] Ignored offer intended for ${msg.to}, I am ${this.peerId}`);
          return;
        }
        this.callbacks.onOffer?.({ from: msg.from, to: msg.to, sdp: msg.sdp });
        break;
      }

      case "answer": {
        if (msg.to !== this.peerId) {
          console.warn(`[Signaling] Ignored answer intended for ${msg.to}, I am ${this.peerId}`);
          return;
        }
        this.callbacks.onAnswer?.({ from: msg.from, to: msg.to, sdp: msg.sdp });
        break;
      }

      case "ice-candidate": {
        if (msg.to !== this.peerId) {
          console.warn(
            `[Signaling] Ignored ICE candidate intended for ${msg.to}, I am ${this.peerId}`,
          );
          return;
        }
        this.callbacks.onIceCandidate?.({ from: msg.from, to: msg.to, candidate: msg.candidate });
        break;
      }

      case "peer-left": {
        this.peersCount = Math.max(1, msg.peersCount);
        this.callbacks.onPeerLeft?.(msg);
        break;
      }

      case "room-full": {
        this.callbacks.onRoomFull?.(msg);
        break;
      }

      case "error": {
        this.callbacks.onError?.({ message: msg.message });
        break;
      }

      case "media-state": {
        if (msg.to && msg.to !== this.peerId) {
          return;
        }
        this.callbacks.onMediaState?.({
          from: msg.from,
          videoEnabled: msg.videoEnabled,
          audioEnabled: msg.audioEnabled,
        });
        break;
      }

      case "caption": {
        this.callbacks.onCaption?.(msg.caption);
        for (const listener of this.captionListeners) {
          try {
            listener(msg.caption);
          } catch (err) {
            console.warn("[Signaling] Caption listener error:", err);
          }
        }
        break;
      }

      case "stt-capabilities": {
        this.callbacks.onSTTCapabilities?.(msg);
        for (const listener of this.sttCapabilitiesListeners) {
          try {
            listener(msg);
          } catch (err) {
            console.warn("[Signaling] STT capabilities listener error:", err);
          }
        }
        break;
      }

      case "stt-state": {
        this.callbacks.onSTTState?.(msg);
        for (const listener of this.sttStateListeners) {
          try {
            listener(msg);
          } catch (err) {
            console.warn("[Signaling] STT state listener error:", err);
          }
        }
        break;
      }
    }
  }

  public sendSTTStart(mimeType: string, language = "en-US"): void {
    this.send({
      type: "stt-start",
      mimeType,
      language,
    });
  }

  public sendSTTStop(): void {
    this.send({
      type: "stt-stop",
    });
  }

  public sendSTTAudioBinary(data: ArrayBuffer | Blob): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  public sendSTTAudioChunk(
    chunkIndex: number,
    base64Data: string,
    durationMs?: number,
    timestamp = Date.now(),
  ): void {
    this.send({
      type: "stt-audio-chunk",
      chunkIndex,
      data: base64Data,
      durationMs,
      timestamp,
    });
  }

  public joinRoom(roomId: string, displayName?: string, authToken?: string): void {
    this.roomId = roomId;
    if (displayName) this.displayName = displayName;
    if (authToken) this.authToken = authToken;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      return;
    }
    this.send({
      type: "join",
      roomId,
      peerId: this.peerId,
      displayName: this.displayName,
      authToken: this.authToken,
    });
  }

  public leaveRoom(): void {
    if (this.roomId) {
      this.send({ type: "leave" });
    }
    this.roomId = null;
    this.peersCount = 0;
  }

  public sendOffer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({
      type: "offer",
      from: this.peerId,
      to,
      sdp,
    });
  }

  public sendAnswer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({
      type: "answer",
      from: this.peerId,
      to,
      sdp,
    });
  }

  public sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    this.send({
      type: "ice-candidate",
      from: this.peerId,
      to,
      candidate,
    });
  }

  public broadcastMediaState(videoEnabled: boolean, audioEnabled: boolean): void {
    this.send({
      type: "media-state",
      from: this.peerId,
      videoEnabled,
      audioEnabled,
    });
  }

  public broadcastCaption(caption: CaptionPayload): void {
    this.send({
      type: "caption",
      caption,
    });
  }

  public sendMediaState(to: string, videoEnabled: boolean, audioEnabled: boolean): void {
    this.send({
      type: "media-state",
      from: this.peerId,
      to,
      videoEnabled,
      audioEnabled,
    });
  }

  private send(msg: SignalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Join messages contain the auth token and captions may contain
      // private conversation text; log only the safe message kind.
      console.log("[Signaling] Sending:", msg.type);
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[Signaling] Cannot send - WebSocket not open:", this.ws?.readyState);
    }
  }

  public close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.leaveRoom();
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
}
