export type SignalingState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface RemotePeerInfo {
  peerId: string;
  displayName?: string;
}

export interface LocalSTTTimings {
  speechDetectionMs?: number;
  firstInterimMs?: number;
  finalResultMs?: number;
  totalRecognitionMs?: number;
}

export type CommunicationSource = "speech" | "sign" | "typed";

export interface CommunicationMetadata {
  signHand?: "Left" | "Right";
  confidenceScore?: number;
  isGesture?: boolean;
  rawLandmarkCount?: number;
}

export interface CaptionPayload {
  captionId: string;
  utteranceId: string;
  revision: number;
  speakerPeerId: string;
  speakerDisplayName: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  source?: CommunicationSource;
  confidence?: number;
  metadata?: CommunicationMetadata;
  language?: string;
  clientSentAt?: number;
  serverReceivedAt?: number;
  serverSentAt?: number;
  localSTTTimings?: LocalSTTTimings;
}

export type CommunicationEvent = CaptionPayload;

export type SignalMessage =
  | {
      type: "join";
      roomId: string;
      peerId: string;
      displayName?: string;
      authToken?: string;
    }
  | {
      type: "leave";
    }
  | {
      type: "joined";
      roomId: string;
      peerId: string;
      peersCount: number;
      existingPeers: RemotePeerInfo[];
      displayName?: string;
    }
  | {
      type: "peer-joined";
      peerId: string;
      displayName?: string;
      peersCount: number;
    }
  | {
      type: "offer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice-candidate";
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      /** Application-level media state for a participant */
      type: "media-state";
      from: string;
      to?: string; // If omitted, server broadcasts to all peers in room
      videoEnabled: boolean;
      audioEnabled: boolean;
    }
  | {
      /** Real-time live caption event broadcast */
      type: "caption";
      caption: CaptionPayload;
    }
  | {
      /** Server announces STT capabilities upon connection */
      type: "stt-capabilities";
      available: boolean;
      provider: "deepgram" | "mock" | "browser-fallback";
      model?: string;
    }
  | {
      /** Client requests opening a server-side streaming STT session */
      type: "stt-start";
      mimeType: string;
      language?: string;
    }
  | {
      /** Client requests closing the server-side streaming STT session */
      type: "stt-stop";
    }
  | {
      /** Server reports STT session state changes */
      type: "stt-state";
      state: "active" | "reconnecting" | "failed" | "closed";
      message?: string;
    }
  | {
      /** Client streams an encoded audio chunk to the server */
      type: "stt-audio-chunk";
      chunkIndex: number;
      data: string; // Base64-encoded audio chunk
      durationMs?: number;
      timestamp: number;
    }
  | {
      type: "peer-left";
      peerId: string;
      peersCount: number;
    }
  | {
      type: "room-full";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };
