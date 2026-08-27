import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { SignalMessage, CaptionPayload } from "../lib/webrtc/signaling-protocol";
import { MAX_PARTICIPANTS } from "../lib/webrtc/config";
import { sttManager } from "./stt-manager";

interface RoomPeer {
  peerId: string;
  ws: WebSocket;
  displayName?: string;
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

export function setupSignalingServer(server: UpgradeableServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/ws" || url.pathname === "/ws/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let currentPeerId: string | null = null;

    const cleanupPeer = () => {
      if (!currentRoomId || !currentPeerId) return;

      // Invariant: Always terminate any active STT session immediately when peer disconnects (Zero orphan sessions)
      sttManager.stopSession(currentPeerId);

      const room = rooms.get(currentRoomId);
      if (room) {
        // Only evict if this WS still owns the entry — a rejoining peer on a
        // new socket must not have its fresh entry deleted by the old socket's
        // cleanup firing late.
        const entry = room.peers.get(currentPeerId);
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

    ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      // Direct binary audio transport: eliminates ~33% Base64 encoding overhead
      if (isBinary) {
        if (currentPeerId) {
          const buffer = Buffer.isBuffer(data)
            ? data
            : Array.isArray(data)
              ? Buffer.concat(data)
              : Buffer.from(data);
          sttManager.feedAudioChunk(currentPeerId, buffer);
        }
        return;
      }

      try {
        const msg: SignalMessage = JSON.parse(data.toString());

        switch (msg.type) {
          case "join": {
            const { roomId, peerId, displayName } = msg;

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

            room.peers.set(peerId, { peerId, ws, displayName });

            console.log(
              `[signaling] join peer=${peerId} name=${displayName || "none"} room=${roomId} total=${room.peers.size}/${MAX_PARTICIPANTS}`,
            );

            ws.send(
              JSON.stringify({
                type: "joined",
                roomId,
                peerId,
                peersCount: room.peers.size,
                existingPeers,
                displayName,
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
                    displayName,
                    peersCount: room.peers.size,
                  } satisfies SignalMessage),
                );
              }
            }
            break;
          }

          case "stt-start": {
            if (!currentRoomId || !currentPeerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const senderPeer = room.peers.get(currentPeerId);
            if (!senderPeer) return;

            console.log(
              `[signaling] stt-start from peer=${currentPeerId} mimeType=${msg.mimeType}`,
            );
            sttManager.startSession(
              currentPeerId,
              senderPeer.displayName || "Participant",
              currentRoomId,
              msg.mimeType,
              msg.language,
              {
                onCaption: (caption: CaptionPayload) => {
                  const payloadStr = JSON.stringify({
                    type: "caption",
                    caption,
                  } satisfies SignalMessage);
                  const activeRoom = rooms.get(currentRoomId!);
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
                  if (ws.readyState === WebSocket.OPEN) {
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
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const target = room.peers.get(msg.to);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify(msg));
            }
            break;
          }

          case "media-state": {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            if (msg.to) {
              const target = room.peers.get(msg.to);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(JSON.stringify(msg));
              }
            } else {
              for (const [pid, peer] of room.peers.entries()) {
                if (pid !== msg.from && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify(msg));
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

            // Invariant: Server validates and stamps authenticated speaker identity
            const serverReceivedAt = Date.now();
            const validatedCaption: SignalMessage = {
              type: "caption",
              caption: {
                captionId: msg.caption.captionId,
                utteranceId: msg.caption.utteranceId,
                revision: msg.caption.revision,
                speakerPeerId: senderPeer.peerId,
                speakerDisplayName: senderPeer.displayName || "Participant",
                text: msg.caption.text,
                isFinal: msg.caption.isFinal,
                timestamp: msg.caption.timestamp || Date.now(),
                language: msg.caption.language,
                clientSentAt: msg.caption.clientSentAt || msg.caption.timestamp || serverReceivedAt,
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
