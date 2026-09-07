import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useCamera } from "@/hooks/use-camera";
import { useMicrophone } from "@/hooks/use-microphone";
import { PeerConnectionManager, type PeerStateDiagnostics } from "@/lib/webrtc/peer";
import { SignalingBroker } from "@/lib/webrtc/signaling";
import type {
  SignalingState,
  RemotePeerInfo,
  CaptionPayload,
} from "@/lib/webrtc/signaling-protocol";
import { MAX_PARTICIPANTS } from "@/lib/webrtc/config";

export interface TransportTelemetry {
  lastCaptionId?: string;
  clientSentAt?: number;
  serverReceivedAt?: number;
  serverSentAt?: number;
  remoteReceivedAt?: number;
  clientToServerMs?: number;
  serverProcessingMs?: number;
  serverToRemoteMs?: number;
  remoteRenderLatencyMs?: number;
  localSTTTimings?: {
    speechDetectionMs?: number;
    firstInterimMs?: number;
    finalResultMs?: number;
    totalRecognitionMs?: number;
  };
}

declare global {
  interface Window {
    __VOXONIX_TRANSPORT_TELEMETRY__?: TransportTelemetry;
  }
}

export interface UsePeerConnectionOptions {
  initialRoomId?: string;
  autoJoin?: boolean;
  displayName?: string;
  authToken?: string;
  /** Media is acquired only after the caller has an explicit user intent. */
  autoStartMedia?: boolean;
}

export type RoomState =
  | "idle"
  | "joining"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "leaving";

export interface Participant {
  peerId: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isLocal: boolean;
  stream: MediaStream | null;
  connectionState?: RTCPeerConnectionState;
}

interface RemotePeerState {
  peerId: string;
  displayName: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  connectionState: RTCPeerConnectionState;
}

export function usePeerConnection(options: UsePeerConnectionOptions = {}) {
  const camera = useCamera();
  const microphone = useMicrophone();

  // Stable client-only peer identifier
  const [peerId] = useState<string>(() => Math.random().toString(36).substring(2, 9));
  const [roomId, setRoomId] = useState<string>(options.initialRoomId ?? "");
  const [signalingStatus, setSignalingStatus] = useState<SignalingState>("disconnected");
  const [peersCount, setPeersCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isRoomFull, setIsRoomFull] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);

  // Map of remote peer metadata: peerId -> RemotePeerState
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeerState>>(new Map());

  // Map of remote streams: peerId -> MediaStream
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // Map of peer diagnostics: peerId -> PeerStateDiagnostics
  const [diagnosticsMap, setDiagnosticsMap] = useState<Map<string, PeerStateDiagnostics>>(
    new Map(),
  );

  // Bounded rolling window of live caption events
  const [captions, setCaptions] = useState<CaptionPayload[]>([]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  // N-1 PeerConnectionManagers: peerId -> PeerConnectionManager
  const peerManagersRef = useRef<Map<string, PeerConnectionManager>>(new Map());
  const signalingRef = useRef<SignalingBroker | null>(null);

  // Always-current view of camera/mic for async callbacks
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const microphoneRef = useRef(microphone);
  microphoneRef.current = microphone;

  // Local media enabled states
  const localVideoEnabled =
    camera.state === "live" &&
    (camera.stream?.getVideoTracks()[0]?.readyState ?? "ended") === "live";
  const localAudioEnabled = !microphone.isMuted && microphone.state === "live";

  const localVideoEnabledRef = useRef(localVideoEnabled);
  localVideoEnabledRef.current = localVideoEnabled;
  const localAudioEnabledRef = useRef(localAudioEnabled);
  localAudioEnabledRef.current = localAudioEnabled;

  const localDisplayName = options.displayName || "Participant";

  // ── Start local camera & mic only after explicit call entry ────────────────
  useEffect(() => {
    if (!options.autoStartMedia) return;
    camera.startCamera().catch(() => {});
    microphone.startMicrophone().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.autoStartMedia]);

  // ── Sync local tracks to all active peer connections ───────────────────────
  const syncLocalTracks = useCallback(() => {
    const vt = cameraRef.current.stream?.getVideoTracks()[0] ?? null;
    const at = microphoneRef.current.stream?.getAudioTracks()[0] ?? null;
    console.log(
      `[PC-Mesh] syncLocalTracks to ${peerManagersRef.current.size} peers: v=${vt?.readyState ?? "null"} a=${at?.readyState ?? "null"}`,
    );
    for (const manager of peerManagersRef.current.values()) {
      void manager.syncTracks(vt, at);
    }
  }, []);

  useEffect(() => {
    syncLocalTracks();
  }, [camera.stream, microphone.stream, syncLocalTracks]);

  // ── Broadcast local media state to all peers ───────────────────────────────
  const broadcastMediaState = useCallback(() => {
    if (signalingRef.current && signalingRef.current.getStatus() === "connected") {
      signalingRef.current.broadcastMediaState(
        localVideoEnabledRef.current,
        localAudioEnabledRef.current,
      );
    }
  }, []);

  useEffect(() => {
    broadcastMediaState();
  }, [localVideoEnabled, localAudioEnabled, broadcastMediaState]);

  // ── PeerConnectionManager factory ──────────────────────────────────────────
  const getOrCreatePeerManager = useCallback((remotePid: string): PeerConnectionManager => {
    let manager = peerManagersRef.current.get(remotePid);
    if (manager) return manager;

    console.log(`[PC-Mesh] Initializing PeerConnectionManager for peer=${remotePid}`);
    manager = new PeerConnectionManager(remotePid, {
      onDiagnosticsChange: (diag) => {
        setDiagnosticsMap((prev) => {
          const next = new Map(prev);
          next.set(remotePid, diag);
          return next;
        });
        setRemotePeers((prev) => {
          const current = prev.get(remotePid);
          if (!current || current.connectionState === diag.connectionState) return prev;
          const next = new Map(prev);
          next.set(remotePid, { ...current, connectionState: diag.connectionState });
          return next;
        });
      },
      onIceCandidate: (candidate) => {
        signalingRef.current?.sendIceCandidate(remotePid, candidate.toJSON());
      },
      onRemoteStream: (stream) => {
        console.log(
          `[PC-Mesh] Remote stream received from peer=${remotePid} vTracks=${stream.getVideoTracks().length} aTracks=${stream.getAudioTracks().length}`,
        );
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(remotePid, stream);
          return next;
        });
      },
      onError: (err) => {
        console.error(`[PC-Mesh] Error with peer=${remotePid}:`, err);
      },
    });

    peerManagersRef.current.set(remotePid, manager);
    return manager;
  }, []);

  const closePeerConnection = useCallback((remotePid: string) => {
    const manager = peerManagersRef.current.get(remotePid);
    if (manager) {
      console.log(`[PC-Mesh] Closing PeerConnection for peer=${remotePid}`);
      manager.close();
      peerManagersRef.current.delete(remotePid);
    }
    setRemoteStreams((prev) => {
      if (!prev.has(remotePid)) return prev;
      const next = new Map(prev);
      next.delete(remotePid);
      return next;
    });
    setRemotePeers((prev) => {
      if (!prev.has(remotePid)) return prev;
      const next = new Map(prev);
      next.delete(remotePid);
      return next;
    });
    setDiagnosticsMap((prev) => {
      if (!prev.has(remotePid)) return prev;
      const next = new Map(prev);
      next.delete(remotePid);
      return next;
    });
  }, []);

  const resetAllPeerConnections = useCallback(() => {
    for (const [pid, manager] of peerManagersRef.current.entries()) {
      console.log(`[PC-Mesh] Resetting PeerConnection for peer=${pid}`);
      manager.close();
    }
    peerManagersRef.current.clear();
    setRemoteStreams(new Map());
    setRemotePeers(new Map());
    setDiagnosticsMap(new Map());
  }, []);

  // Stable handlers ref for async callbacks
  const handlersRef = useRef({
    getOrCreatePeerManager,
    closePeerConnection,
    resetAllPeerConnections,
    syncLocalTracks,
  });
  handlersRef.current = {
    getOrCreatePeerManager,
    closePeerConnection,
    resetAllPeerConnections,
    syncLocalTracks,
  };

  // ── Signaling Broker Lifecycle ─────────────────────────────────────────────
  const autoJoin = options.autoJoin;
  const initialRoomId = options.initialRoomId;
  const authToken = options.authToken;

  useEffect(() => {
    let active = true;

    const broker = new SignalingBroker(
      peerId,
      {
        onStatusChange: (status) => {
          console.log("[WS-Mesh] status →", status);
          if (active) setSignalingStatus(status);
        },

        // When local peer successfully joins the room
        onRoomJoined: async (data) => {
          if (!active) return;
          console.log(
            `[WS-Mesh] Joined room=${data.roomId} peers=${data.peersCount} existingPeers=${data.existingPeers.length}`,
          );
          setRoomId(data.roomId);
          setPeersCount(data.peersCount);
          setError(null);
          setIsRoomFull(false);

          // Register existing remote peers
          setRemotePeers((prev) => {
            const next = new Map(prev);
            for (const ep of data.existingPeers) {
              if (!next.has(ep.peerId)) {
                next.set(ep.peerId, {
                  peerId: ep.peerId,
                  displayName: ep.displayName || `Participant ${ep.peerId.slice(0, 4)}`,
                  videoEnabled: true,
                  audioEnabled: true,
                  connectionState: "new",
                });
              }
            }
            return next;
          });

          // Broadcast current media state
          setTimeout(() => {
            if (active) {
              broker.broadcastMediaState(
                localVideoEnabledRef.current,
                localAudioEnabledRef.current,
              );
            }
          }, 100);

          // Newcomer initiates offer to each existing peer
          const vt = cameraRef.current.stream?.getVideoTracks()[0] ?? null;
          const at = microphoneRef.current.stream?.getAudioTracks()[0] ?? null;

          for (const ep of data.existingPeers) {
            console.log(`[WS-Mesh] Initiating offer to existing peer=${ep.peerId}`);
            const manager = handlersRef.current.getOrCreatePeerManager(ep.peerId);
            manager.addTracks(vt, at);
            try {
              const offer = await manager.createOffer();
              if (active) {
                broker.sendOffer(ep.peerId, offer);
              }
            } catch (err) {
              console.error(`[WS-Mesh] createOffer failed for peer=${ep.peerId}:`, err);
            }
          }
        },

        // When a new remote peer joins after us
        onPeerJoined: (data) => {
          if (!active) return;
          console.log(
            `[WS-Mesh] New peer joined room: peerId=${data.peerId} name=${data.displayName} total=${data.peersCount}`,
          );
          setPeersCount(data.peersCount);

          setRemotePeers((prev) => {
            const next = new Map(prev);
            next.set(data.peerId, {
              peerId: data.peerId,
              displayName: data.displayName || `Participant ${data.peerId.slice(0, 4)}`,
              videoEnabled: true,
              audioEnabled: true,
              connectionState: "new",
            });
            return next;
          });

          // Announce our media state so the newcomer immediately gets it
          setTimeout(() => {
            if (active) {
              broker.sendMediaState(
                data.peerId,
                localVideoEnabledRef.current,
                localAudioEnabledRef.current,
              );
            }
          }, 150);
        },

        // Handle incoming offer from a peer
        onOffer: async ({ from, sdp }) => {
          if (!active) return;
          console.log(`[WS-Mesh] Received offer from peer=${from}`);
          const manager = handlersRef.current.getOrCreatePeerManager(from);

          const vt = cameraRef.current.stream?.getVideoTracks()[0] ?? null;
          const at = microphoneRef.current.stream?.getAudioTracks()[0] ?? null;

          try {
            const answer = await manager.handleOfferWithTracks(sdp, vt, at);
            if (active) {
              console.log(`[WS-Mesh] Sending answer to peer=${from}`);
              broker.sendAnswer(from, answer);
            }
          } catch (err) {
            console.error(`[WS-Mesh] handleOfferWithTracks failed for peer=${from}:`, err);
          }
        },

        // Handle incoming answer from a peer
        onAnswer: async ({ from, sdp }) => {
          if (!active) return;
          console.log(`[WS-Mesh] Received answer from peer=${from}`);
          const manager = peerManagersRef.current.get(from);
          if (!manager) {
            console.warn(`[WS-Mesh] No active manager for peer=${from} on answer`);
            return;
          }
          try {
            await manager.handleAnswer(sdp);
            console.log(`[WS-Mesh] Answer applied successfully for peer=${from}`);
          } catch (err) {
            console.error(`[WS-Mesh] handleAnswer failed for peer=${from}:`, err);
          }
        },

        // Handle incoming ICE candidate
        onIceCandidate: async ({ from, candidate }) => {
          if (!active) return;
          const manager = peerManagersRef.current.get(from);
          if (!manager) {
            return;
          }
          try {
            await manager.addIceCandidate(candidate);
          } catch (err) {
            console.warn(`[WS-Mesh] addIceCandidate failed for peer=${from}:`, err);
          }
        },

        // Handle peer departure
        onPeerLeft: ({ peerId: leftPid, peersCount: updatedCount }) => {
          if (!active) return;
          console.log(`[WS-Mesh] Remote peer left: ${leftPid} (remaining count: ${updatedCount})`);
          setPeersCount(updatedCount);
          handlersRef.current.closePeerConnection(leftPid);
        },

        // Handle room full error
        onRoomFull: (data) => {
          if (!active) return;
          console.log("[WS-Mesh] Room full rejection:", data.message);
          setError(data.message);
          setIsRoomFull(true);
        },

        onError: (data) => {
          console.warn("[WS-Mesh] Signaling error:", data.message);
          setError(data.message);
        },

        // Handle media-state updates from a remote peer
        onMediaState: (data) => {
          if (!active) return;
          console.log(
            `[WS-Mesh] Media state from peer=${data.from}: video=${data.videoEnabled} audio=${data.audioEnabled}`,
          );
          setRemotePeers((prev) => {
            const current = prev.get(data.from);
            if (!current) {
              const next = new Map(prev);
              next.set(data.from, {
                peerId: data.from,
                displayName: `Participant ${data.from.slice(0, 4)}`,
                videoEnabled: data.videoEnabled,
                audioEnabled: data.audioEnabled,
                connectionState: "connected",
              });
              return next;
            }
            if (
              current.videoEnabled === data.videoEnabled &&
              current.audioEnabled === data.audioEnabled
            ) {
              return prev;
            }
            const next = new Map(prev);
            next.set(data.from, {
              ...current,
              videoEnabled: data.videoEnabled,
              audioEnabled: data.audioEnabled,
            });
            return next;
          });
        },

        // Handle real-time caption broadcast from any participant in the room
        onCaption: (caption) => {
          if (!active) return;

          const remoteReceivedAt = Date.now();
          const clientToServerMs =
            caption.serverReceivedAt && caption.clientSentAt
              ? Math.max(0, caption.serverReceivedAt - caption.clientSentAt)
              : undefined;
          const serverProcessingMs =
            caption.serverSentAt && caption.serverReceivedAt
              ? Math.max(0, caption.serverSentAt - caption.serverReceivedAt)
              : undefined;
          const serverToRemoteMs = caption.serverSentAt
            ? Math.max(0, remoteReceivedAt - caption.serverSentAt)
            : undefined;

          const tStateStart = performance.now();

          setCaptions((prev) => {
            const existingIndex = prev.findIndex((c) => c.utteranceId === caption.utteranceId);
            if (existingIndex >= 0) {
              // Update in-place if revision is >= existing revision
              if (caption.revision >= prev[existingIndex].revision) {
                const next = [...prev];
                next[existingIndex] = caption;
                return next;
              }
              return prev;
            }
            // New utterance: append and retain bounded 50-item history for transcript buffer
            const next = [...prev, caption];
            if (next.length > 50) {
              return next.slice(next.length - 50);
            }
            return next;
          });

          // Record transport and render latency in requestAnimationFrame
          if (typeof window !== "undefined") {
            requestAnimationFrame(() => {
              const renderDurationMs = Math.max(0, performance.now() - tStateStart);
              window.__VOXONIX_TRANSPORT_TELEMETRY__ = {
                lastCaptionId: caption.captionId,
                clientSentAt: caption.clientSentAt,
                serverReceivedAt: caption.serverReceivedAt,
                serverSentAt: caption.serverSentAt,
                remoteReceivedAt,
                clientToServerMs,
                serverProcessingMs,
                serverToRemoteMs,
                remoteRenderLatencyMs: renderDurationMs,
                localSTTTimings: caption.localSTTTimings,
              };
            });
          }
        },
      },
      localDisplayName,
      authToken,
    );

    signalingRef.current = broker;
    broker.connect();

    if (autoJoin && initialRoomId) {
      broker.joinRoom(initialRoomId, localDisplayName, authToken);
    }

    return () => {
      active = false;
      broker.close();
      signalingRef.current = null;
      handlersRef.current.resetAllPeerConnections();
    };
  }, [peerId, autoJoin, initialRoomId, localDisplayName, authToken]);

  // ── Room Actions ───────────────────────────────────────────────────────────
  const joinRoom = useCallback(
    (targetRoomId?: string, targetDisplayName?: string) => {
      const roomToJoin = targetRoomId ?? roomId;
      setError(null);
      setIsRoomFull(false);
      resetAllPeerConnections();
      signalingRef.current?.joinRoom(roomToJoin, targetDisplayName ?? localDisplayName, authToken);
    },
    [roomId, localDisplayName, authToken, resetAllPeerConnections],
  );

  const leaveRoom = useCallback(() => {
    signalingRef.current?.leaveRoom();
    setPeersCount(0);
    resetAllPeerConnections();
  }, [resetAllPeerConnections]);

  const leaveCall = useCallback(() => {
    setIsLeaving(true);
    signalingRef.current?.leaveRoom();
    setPeersCount(0);
    resetAllPeerConnections();
    camera.stopCamera();
    microphone.stopMicrophone();
  }, [resetAllPeerConnections, camera, microphone]);

  // ── Unified Participants List ──────────────────────────────────────────────
  // Combines local participant and all remote participants into a single list
  const participants: Participant[] = useMemo(() => {
    const list: Participant[] = [];

    // Local participant is always first
    list.push({
      peerId,
      displayName: localDisplayName,
      audioEnabled: localAudioEnabled,
      videoEnabled: localVideoEnabled,
      isLocal: true,
      stream: camera.stream,
      connectionState: "connected",
    });

    // Remote participants
    for (const [pid, peerInfo] of remotePeers.entries()) {
      const stream = remoteStreams.get(pid) || null;
      list.push({
        peerId: pid,
        displayName: peerInfo.displayName,
        audioEnabled: peerInfo.audioEnabled,
        videoEnabled: peerInfo.videoEnabled,
        isLocal: false,
        stream,
        connectionState: peerInfo.connectionState,
      });
    }

    return list;
  }, [
    peerId,
    localDisplayName,
    localAudioEnabled,
    localVideoEnabled,
    camera.stream,
    remotePeers,
    remoteStreams,
  ]);

  // ── Global Room State Derivation ───────────────────────────────────────────
  let roomState: RoomState = "idle";
  if (isLeaving) {
    roomState = "leaving";
  } else if (isRoomFull || (error && error.toLowerCase().includes("full"))) {
    roomState = "error";
  } else if (signalingStatus === "connecting" || signalingStatus === "reconnecting") {
    roomState = "joining";
  } else if (signalingStatus === "connected") {
    if (peersCount <= 1) {
      roomState = "waiting";
    } else {
      const anyConnected = Array.from(remotePeers.values()).some(
        (p) => p.connectionState === "connected",
      );
      roomState = anyConnected ? "connected" : "connecting";
    }
  } else if (signalingStatus === "error") {
    roomState = "error";
  } else if (signalingStatus === "disconnected") {
    roomState = "disconnected";
  }

  return {
    peerId,
    roomId,
    setRoomId,
    signalingStatus,
    peersCount: Math.max(peersCount, participants.length),
    maxParticipants: MAX_PARTICIPANTS,
    camera,
    microphone,
    participants,
    remoteStreams,
    diagnosticsMap,
    error,
    isRoomFull,
    roomState,
    localVideoEnabled,
    localAudioEnabled,
    captions,
    signaling: signalingRef.current,
    broadcastCaption: useCallback(
      (caption: CaptionPayload) => signalingRef.current?.broadcastCaption(caption),
      [],
    ),
    clearCaptions: useCallback(() => setCaptions([]), []),
    joinRoom,
    leaveRoom,
    leaveCall,
    syncLocalTracks,
  };
}
