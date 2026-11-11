import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { SignalMessage, CaptionPayload } from "../lib/webrtc/signaling-protocol";
import { MAX_PARTICIPANTS } from "../lib/webrtc/config";
import { sttManager } from "./stt-manager";
import { parseLocalTestAuthToken, LOCAL_TEST_TOKEN_PREFIX } from "../lib/test-mode";
import { verifySessionToken, onSessionRevoked, findSessionByToken, SESSION_CONFIG } from "./db";
import { type PrimaryProfile, hasCapability } from "../lib/capabilities";

async function verifyAuthToken(authToken?: string): Promise<{
  userId: string;
  email?: string;
  displayName?: string;
  profile?: PrimaryProfile;
  tokenHash?: string;
  sessionExpiresAtMs?: number;
} | null> {
  if (!authToken || typeof authToken !== "string" || !authToken.trim()) return null;

  // 1. Verify against database sessions (authoritative in both prod and dev)
  const dbUser = verifySessionToken(authToken);
  if (dbUser) {
    const session = findSessionByToken(authToken);
    const sessionExpiresAtMs = session?.expiresAt
      ? new Date(session.expiresAt).getTime()
      : undefined;
    return {
      userId: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.displayName,
      profile: dbUser.profile,
      tokenHash: session?.tokenHash,
      sessionExpiresAtMs,
    };
  }

  // 2. In production, unauthenticated test tokens are strictly disallowed
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  // 3. Check local test tokens (development/testing only)
  const testIdentity = parseLocalTestAuthToken(authToken);
  if (testIdentity) {
    return {
      userId: testIdentity.userId,
      email: testIdentity.email,
      displayName: testIdentity.displayName,
    };
  }

  // 4. Check local authenticated tokens (development/testing only)
  if (authToken.startsWith("voxonix-token:") || authToken.startsWith(LOCAL_TEST_TOKEN_PREFIX)) {
    const payload = authToken.replace(/^(voxonix-token:|voxonix-local-test-token:)/, "");
    const colonIdx = payload.indexOf(":");
    if (colonIdx !== -1) {
      const userId = payload.slice(0, colonIdx);
      const rawName = payload.slice(colonIdx + 1);
      try {
        const displayName = decodeURIComponent(rawName);
        return {
          userId,
          email: `${userId}@voxonix.local`,
          displayName: displayName || "Participant",
        };
      } catch {
        // Fallback
      }
    }
  }

  return null;
}

interface RoomPeer {
  peerId: string;
  ws: WebSocket;
  displayName?: string;
  userId?: string;
  profile?: PrimaryProfile;
  authToken?: string;
  tokenHash?: string;
  sessionExpiresAtMs?: number;
  lastActivityMs: number;
}

interface Room {
  id: string;
  peers: Map<string, RoomPeer>;
}

interface UpgradeableServer {
  on(
    event: "upgrade",
    listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): void;
}

const rooms = new Map<string, Room>();

const COMMUNICATION_SOURCES = new Set(["speech", "sign", "typed"]);

function sanitizeCaptionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2_000) return null;
  return text;
}

function sanitizeIdentifier(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) return fallback;
  return normalized;
}

function isActivePeer(roomId: string | null, peerId: string | null, ws: WebSocket): boolean {
  if (!roomId || !peerId) return false;
  return rooms.get(roomId)?.peers.get(peerId)?.ws === ws;
}

export function inspectActiveSessionsNow(): { evictedCount: number; activeCount: number } {
  let evictedCount = 0;
  let activeCount = 0;
  const now = Date.now();

  for (const [roomId, room] of rooms.entries()) {
    for (const [peerId, peer] of room.peers.entries()) {
      // 1. Absolute Expiration: Never allow a connection to live past the session's absolute expiry
      if (peer.sessionExpiresAtMs && now >= peer.sessionExpiresAtMs) {
        console.log(
          `[signaling] Absolute session expiry reached for peer=${peerId} user=${peer.userId}`,
        );
        try {
          peer.ws.close(4401, "Session expired (absolute timeout)");
        } catch {
          // Ignore
        }
        room.peers.delete(peerId);
        sttManager.stopSession(peerId);
        evictedCount++;
        continue;
      }

      // 2. Idle Expiration: Disconnect silent clients that have not sent activity within idle TTL
      if (now - peer.lastActivityMs > SESSION_CONFIG.idleTtlMs) {
        console.log(
          `[signaling] Idle session timeout reached for peer=${peerId} user=${peer.userId}`,
        );
        try {
          peer.ws.close(4401, "Session expired (idle timeout)");
        } catch {
          // Ignore
        }
        room.peers.delete(peerId);
        sttManager.stopSession(peerId);
        evictedCount++;
        continue;
      }

      // 3. Database session validity: Check if session was revoked in DB
      if (peer.authToken) {
        const user = verifySessionToken(peer.authToken);
        if (!user) {
          console.log(
            `[signaling] Session no longer valid in database for peer=${peerId} user=${peer.userId}`,
          );
          try {
            peer.ws.close(4401, "Session revoked");
          } catch {
            // Ignore
          }
          room.peers.delete(peerId);
          sttManager.stopSession(peerId);
          evictedCount++;
          continue;
        }
      }

      activeCount++;
    }
    if (room.peers.size === 0) {
      rooms.delete(roomId);
    }
  }

  return { evictedCount, activeCount };
}

let sessionCheckInterval: NodeJS.Timeout | null = null;

export function stopSessionInspector(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

export function setupSignalingServer(server: UpgradeableServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Hook into database session revocations to instantly close active WebSockets.
  // Supports multi-device: if revokedTokenHash is provided, only that device is evicted.
  // If revokedTokenHash is omitted, all sessions/devices for that user are evicted.
  onSessionRevoked((revokedUserId, revokedTokenHash) => {
    for (const [roomId, room] of rooms.entries()) {
      for (const [peerId, peer] of room.peers.entries()) {
        const matchesUser = peer.userId === revokedUserId;
        const matchesToken = !revokedTokenHash || peer.tokenHash === revokedTokenHash;
        if (matchesUser && matchesToken) {
          try {
            peer.ws.close(4401, "Session revoked");
          } catch {
            // Ignore
          }
          room.peers.delete(peerId);
          sttManager.stopSession(peerId);
          console.log(
            `[signaling] Evicted WebSocket for revoked session user=${revokedUserId} peer=${peerId} in room=${roomId}`,
          );
        }
      }
      if (room.peers.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  // Start periodic session validity check (every 5 seconds)
  if (!sessionCheckInterval) {
    sessionCheckInterval = setInterval(() => {
      inspectActiveSessionsNow();
    }, 5000);
  }

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/ws" || url.pathname === "/ws/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws: WebSocket, request?: IncomingMessage) => {
    let currentRoomId: string | null = null;
    let currentPeerId: string | null = null;

    // Extract HttpOnly session cookie from the WebSocket HTTP upgrade handshake
    const cookieHeader = request?.headers?.cookie || "";
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)voxonix_session=([^;]+)/);
    const upgradeToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;

    const cleanupPeer = () => {
      if (!currentRoomId || !currentPeerId) return;

      const room = rooms.get(currentRoomId);
      const entry = room?.peers.get(currentPeerId);
      // A peer can rejoin with the same routing ID before the old socket's close
      // event arrives. Do not tear down the replacement socket's STT session.
      // If no replacement owns the entry, this cleanup still owns the session.
      const ownsCurrentRegistration = !entry || entry.ws === ws;
      if (ownsCurrentRegistration) {
        // Invariant: Always terminate any active STT session immediately when
        // the registered peer disconnects (zero orphan sessions).
        sttManager.stopSession(currentPeerId);
      }

      if (room) {
        // Only evict if this WS still owns the entry — a rejoining peer on a
        // new socket must not have its fresh entry deleted by the old socket's
        // cleanup firing late.
        if (entry && entry.ws === ws) {
          room.peers.delete(currentPeerId);
          console.log(
            `[signaling] peer=${currentPeerId} left room=${currentRoomId} remaining=${room.peers.size}`,
          );

          for (const [, peer] of room.peers.entries()) {
            if (peer.ws.readyState === WebSocket.OPEN) {
              const msg: SignalMessage = {
                type: "peer-left",
                peerId: currentPeerId,
                peersCount: room.peers.size + 1, // count including local
              };
              peer.ws.send(JSON.stringify(msg));
            }
          }
        }

        if (room.peers.size === 0) {
          rooms.delete(currentRoomId);
          console.log(`[signaling] room=${currentRoomId} empty — deleted`);
        }
      }

      currentRoomId = null;
      currentPeerId = null;
    };

    ws.on("message", async (data: WebSocket.RawData, isBinary: boolean) => {
      // Direct binary audio transport: eliminates ~33% Base64 encoding overhead
      if (isBinary) {
        if (!currentPeerId || !currentRoomId) {
          console.log(`[signaling] Dropped binary data on unauthenticated socket`);
          ws.close(4401, "Unauthorized");
          return;
        }
        const activePeer = rooms.get(currentRoomId)?.peers.get(currentPeerId);
        if (activePeer) activePeer.lastActivityMs = Date.now();
        const buffer = Buffer.isBuffer(data)
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data);
        sttManager.feedAudioChunk(currentPeerId, buffer);
        return;
      }

      try {
        const msg: SignalMessage = JSON.parse(data.toString());

        // Security Invariant: Every socket must join with verified auth before sending any signaling message
        if (msg.type !== "join" && !isActivePeer(currentRoomId, currentPeerId, ws)) {
          console.log(`[signaling] Rejected unauthenticated message type=${msg.type} on socket`);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Authentication required before signaling. Unauthorized.",
            } satisfies SignalMessage),
          );
          ws.close(4401, "Unauthorized");
          return;
        }

        if (currentRoomId && currentPeerId) {
          const activePeer = rooms.get(currentRoomId)?.peers.get(currentPeerId);
          if (activePeer) activePeer.lastActivityMs = Date.now();
        }

        switch (msg.type) {
          case "join": {
            const { roomId, peerId, displayName, authToken } = msg;
            const effectiveToken = authToken || upgradeToken;

            // Security Invariant: Server-side token verification required for all room joins
            const authUser = await verifyAuthToken(effectiveToken);
            if (!authUser) {
              console.log(
                `[signaling] Unauthorized join attempt rejected for room=${roomId} peer=${peerId}`,
              );
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Authentication required to join room. Unauthorized.",
                } satisfies SignalMessage),
              );
              ws.close(4401, "Unauthorized");
              return;
            }

            // Display names are presentation data, but they still come from
            // authenticated metadata so a joiner cannot impersonate another
            // participant by changing only the browser payload.
            const effectiveDisplayName = authUser.displayName || displayName || "Participant";

            if (currentRoomId && currentPeerId) {
              cleanupPeer();
            }

            let room = rooms.get(roomId);
            if (!room) {
              room = { id: roomId, peers: new Map() };
              rooms.set(roomId, room);
            }

            // ── Sweep dead sockets ────────────────────────────────────────
            for (const [pid, peer] of room.peers.entries()) {
              const s = peer.ws.readyState;
              if (s !== WebSocket.OPEN && s !== WebSocket.CONNECTING) {
                sttManager.stopSession(pid);
                room.peers.delete(pid);
                console.log(`[signaling] swept dead peer=${pid} room=${roomId}`);
              }
            }

            // ── Same-peerId eviction ──────────────────────────────────────
            if (room.peers.has(peerId)) {
              sttManager.stopSession(peerId);
              const stale = room.peers.get(peerId)!;
              if (stale.ws !== ws && stale.ws.readyState === WebSocket.OPEN) {
                stale.ws.close();
              }
              room.peers.delete(peerId);
              console.log(`[signaling] evicted stale peer=${peerId} room=${roomId}`);
            }

            if (room.peers.size >= MAX_PARTICIPANTS) {
              ws.send(
                JSON.stringify({
                  type: "room-full",
                  message: `Room is full. Maximum ${MAX_PARTICIPANTS} participants allowed.`,
                } satisfies SignalMessage),
              );
              console.log(
                `[signaling] room=${roomId} full (${room.peers.size}/${MAX_PARTICIPANTS}) rejected peer=${peerId}`,
              );
              return;
            }

            const existingPeers = Array.from(room.peers.values()).map((p) => ({
              peerId: p.peerId,
              displayName: p.displayName,
            }));

            currentRoomId = roomId;
            currentPeerId = peerId;

            room.peers.set(peerId, {
              peerId,
              ws,
              displayName: effectiveDisplayName,
              userId: authUser.userId,
              profile: authUser.profile,
              authToken,
              tokenHash: authUser.tokenHash,
              sessionExpiresAtMs: authUser.sessionExpiresAtMs,
              lastActivityMs: Date.now(),
            });

            console.log(
              `[signaling] join peer=${peerId} user=${authUser.userId} name=${effectiveDisplayName} room=${roomId} total=${room.peers.size}/${MAX_PARTICIPANTS}`,
            );

            ws.send(
              JSON.stringify({
                type: "joined",
                roomId,
                peerId,
                peersCount: room.peers.size,
                existingPeers,
                displayName: effectiveDisplayName,
              } satisfies SignalMessage),
            );

            // Announce server STT capabilities (provider & model) to client
            const caps = sttManager.getCapabilities();
            ws.send(
              JSON.stringify({
                type: "stt-capabilities",
                available: caps.available,
                provider: caps.provider,
                model: caps.model,
              } satisfies SignalMessage),
            );

            for (const existing of existingPeers) {
              const target = room.peers.get(existing.peerId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  JSON.stringify({
                    type: "peer-joined",
                    peerId,
                    displayName: effectiveDisplayName,
                    peersCount: room.peers.size,
                  } satisfies SignalMessage),
                );
              }
            }
            break;
          }

          case "stt-start": {
            if (!currentRoomId || !currentPeerId) return;
            const joinedRoomId = currentRoomId;
            const joinedPeerId = currentPeerId;
            const room = rooms.get(joinedRoomId);
            if (!room) return;

            const senderPeer = room.peers.get(joinedPeerId);
            if (!senderPeer) return;

            console.log(
              `[signaling] stt-start from peer=${currentPeerId} mimeType=${msg.mimeType}`,
            );
            sttManager.startSession(
              joinedPeerId,
              senderPeer.displayName || "Participant",
              joinedRoomId,
              msg.mimeType,
              msg.language,
              {
                onCaption: (caption: CaptionPayload) => {
                  if (!isActivePeer(joinedRoomId, joinedPeerId, ws)) return;
                  const text = sanitizeCaptionText(caption.text);
                  if (!text) return;

                  const serverReceivedAt = Date.now();
                  const validatedCaption: SignalMessage = {
                    type: "caption",
                    caption: {
                      captionId: sanitizeIdentifier(caption.captionId, `stt_${serverReceivedAt}`),
                      utteranceId: sanitizeIdentifier(
                        caption.utteranceId,
                        `stt_utterance_${serverReceivedAt}`,
                      ),
                      revision:
                        Number.isInteger(caption.revision) && caption.revision > 0
                          ? caption.revision
                          : 1,
                      speakerPeerId: joinedPeerId,
                      speakerUserId: senderPeer.userId,
                      speakerDisplayName: senderPeer.displayName || "Participant",
                      text,
                      isFinal: Boolean(caption.isFinal),
                      timestamp: Number.isFinite(caption.timestamp)
                        ? caption.timestamp
                        : serverReceivedAt,
                      source: "speech",
                      confidence:
                        typeof caption.confidence === "number" &&
                        caption.confidence >= 0 &&
                        caption.confidence <= 1
                          ? caption.confidence
                          : undefined,
                      language: caption.language,
                      clientSentAt: caption.clientSentAt,
                      serverReceivedAt,
                      serverSentAt: Date.now(),
                      localSTTTimings: caption.localSTTTimings,
                    },
                  };
                  const payloadStr = JSON.stringify({
                    ...validatedCaption,
                  } satisfies SignalMessage);
                  const activeRoom = rooms.get(joinedRoomId);
                  if (activeRoom) {
                    for (const [, peer] of activeRoom.peers.entries()) {
                      if (peer.ws.readyState === WebSocket.OPEN) {
                        peer.ws.send(payloadStr);
                      }
                    }
                  }
                },
                onStateChange: (
                  state: "active" | "reconnecting" | "failed" | "closed",
                  message?: string,
                ) => {
                  if (isActivePeer(joinedRoomId, joinedPeerId, ws)) {
                    ws.send(
                      JSON.stringify({
                        type: "stt-state",
                        state,
                        message,
                      } satisfies SignalMessage),
                    );
                  }
                },
              },
            );
            break;
          }

          case "stt-stop": {
            if (currentPeerId) {
              console.log(`[signaling] stt-stop from peer=${currentPeerId}`);
              sttManager.stopSession(currentPeerId);
            }
            break;
          }

          case "stt-audio-chunk": {
            if (currentPeerId && msg.data) {
              const buffer = Buffer.from(msg.data, "base64");
              sttManager.feedAudioChunk(currentPeerId, buffer);
            }
            break;
          }

          case "offer":
          case "answer":
          case "ice-candidate": {
            if (!currentRoomId || !currentPeerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const target = room.peers.get(msg.to);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              // Never forward a client-supplied sender identity. The receiving
              // browser may use `from` to select a PeerConnectionManager.
              target.ws.send(JSON.stringify({ ...msg, from: currentPeerId }));
            }
            break;
          }

          case "media-state": {
            if (!currentRoomId || !currentPeerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            if (msg.to) {
              const target = room.peers.get(msg.to);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(JSON.stringify({ ...msg, from: currentPeerId }));
              }
            } else {
              for (const [pid, peer] of room.peers.entries()) {
                if (pid !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify({ ...msg, from: currentPeerId }));
                }
              }
            }
            break;
          }

          case "caption": {
            if (!currentRoomId || !currentPeerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const senderPeer = room.peers.get(currentPeerId);
            if (!senderPeer) return;

            const text = sanitizeCaptionText(msg.caption?.text);
            if (!text) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Caption text is required and must be 2,000 characters or fewer.",
                } satisfies SignalMessage),
              );
              return;
            }

            let source = COMMUNICATION_SOURCES.has(msg.caption.source || "")
              ? msg.caption.source
              : undefined;

            // Profile Capability Enforcement:
            // If sender claims source="sign", enforce that sender possesses "sign-recognition" capability.
            // If unauthorized, normalize to "typed" to prevent identity and capability spoofing.
            if (
              source === "sign" &&
              senderPeer.profile &&
              !hasCapability(senderPeer.profile, "sign-recognition")
            ) {
              source = "typed";
            }
            const serverReceivedAt = Date.now();
            const timestamp =
              typeof msg.caption.timestamp === "number" && Number.isFinite(msg.caption.timestamp)
                ? msg.caption.timestamp
                : serverReceivedAt;
            const clientSentAt =
              typeof msg.caption.clientSentAt === "number" &&
              Number.isFinite(msg.caption.clientSentAt)
                ? msg.caption.clientSentAt
                : timestamp;
            const validatedCaption: SignalMessage = {
              type: "caption",
              caption: {
                captionId: sanitizeIdentifier(msg.caption.captionId, `caption_${serverReceivedAt}`),
                utteranceId: sanitizeIdentifier(
                  msg.caption.utteranceId,
                  `utterance_${serverReceivedAt}`,
                ),
                revision:
                  Number.isInteger(msg.caption.revision) && msg.caption.revision > 0
                    ? msg.caption.revision
                    : 1,
                speakerPeerId: senderPeer.peerId,
                speakerUserId: senderPeer.userId,
                speakerDisplayName: senderPeer.displayName || "Participant",
                text,
                isFinal: msg.caption.isFinal === true,
                timestamp,
                source,
                confidence:
                  typeof msg.caption.confidence === "number" &&
                  msg.caption.confidence >= 0 &&
                  msg.caption.confidence <= 1
                    ? msg.caption.confidence
                    : undefined,
                metadata: msg.caption.metadata
                  ? {
                      signHand: msg.caption.metadata.signHand,
                      confidenceScore:
                        typeof msg.caption.metadata.confidenceScore === "number" &&
                        msg.caption.metadata.confidenceScore >= 0 &&
                        msg.caption.metadata.confidenceScore <= 1
                          ? msg.caption.metadata.confidenceScore
                          : undefined,
                      isGesture: Boolean(msg.caption.metadata.isGesture),
                    }
                  : undefined,
                language: msg.caption.language,
                clientSentAt,
                serverReceivedAt,
                serverSentAt: Date.now(),
                localSTTTimings: msg.caption.localSTTTimings,
              },
            };

            const payloadStr = JSON.stringify(validatedCaption);
            for (const [, peer] of room.peers.entries()) {
              if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(payloadStr);
              }
            }
            break;
          }

          case "leave": {
            cleanupPeer();
            break;
          }
        }
      } catch (err) {
        console.warn("[signaling] parse error:", err);
      }
    });

    ws.on("close", () => cleanupPeer());
    ws.on("error", (err) => {
      console.warn("[signaling] ws error:", err);
      cleanupPeer();
    });
  });

  return wss;
}
