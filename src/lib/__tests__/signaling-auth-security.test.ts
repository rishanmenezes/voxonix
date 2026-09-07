import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupSignalingServer } from "../../server/signaling-server";
import { EventEmitter } from "node:events";

interface MockWebSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

function createMockWebSocket(): MockWebSocket {
  const ws = new EventEmitter() as MockWebSocket;
  ws.send = vi.fn();
  ws.close = vi.fn();
  ws.readyState = 1; // WebSocket.OPEN
  return ws;
}

describe("Signaling Server Auth & Security Invariant", () => {
  let mockServer: EventEmitter;
  let wss: ReturnType<typeof setupSignalingServer>;

  beforeEach(() => {
    mockServer = new EventEmitter();
    wss = setupSignalingServer(mockServer as unknown as Parameters<typeof setupSignalingServer>[0]);
  });

  it("rejects unauthenticated join attempt with error message and 4401 close code", async () => {
    const mockWs = createMockWebSocket();

    // Emit connection event on wss
    wss.emit("connection", mockWs);

    // Send unauthenticated join message (missing/empty authToken)
    const joinMsg = JSON.stringify({
      type: "join",
      roomId: "ROOM123",
      peerId: "peer-test-1",
      displayName: "Attacker",
      authToken: "", // Missing token
    });

    await mockWs.emit("message", Buffer.from(joinMsg), false);

    // Should have sent error response
    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining("Authentication required to join room. Unauthorized."),
    );

    // Should have closed socket with 4401 code
    expect(mockWs.close).toHaveBeenCalledWith(4401, "Unauthorized");
  });

  it("rejects non-join signaling messages on an unauthenticated socket", async () => {
    const mockWs = createMockWebSocket();

    wss.emit("connection", mockWs);

    // Attempt to send offer without prior authenticated join
    const offerMsg = JSON.stringify({
      type: "offer",
      from: "attacker",
      to: "victim",
      sdp: { type: "offer", sdp: "dummy" },
    });

    await mockWs.emit("message", Buffer.from(offerMsg), false);

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining("Authentication required before signaling. Unauthorized."),
    );
    expect(mockWs.close).toHaveBeenCalledWith(4401, "Unauthorized");
  });

  it("drops binary data sent on an unauthenticated socket and closes connection", async () => {
    const mockWs = createMockWebSocket();

    wss.emit("connection", mockWs);

    const dummyAudioBuffer = Buffer.from([0, 1, 2, 3]);
    await mockWs.emit("message", dummyAudioBuffer, true);

    expect(mockWs.close).toHaveBeenCalledWith(4401, "Unauthorized");
  });
});
