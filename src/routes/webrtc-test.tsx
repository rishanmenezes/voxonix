import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Video,
  Mic,
  ArrowLeft,
  Radio,
  Layers,
  AlertTriangle,
  PhoneCall,
  PhoneOff,
  Users,
} from "lucide-react";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { usePeerConnection } from "@/hooks/use-peer-connection";
import { CameraPreview } from "@/components/media/CameraPreview";
import { MicrophonePreview } from "@/components/media/MicrophonePreview";
import { ParticipantTile } from "@/components/media/ParticipantTile";

export const Route = createFileRoute("/webrtc-test")({
  head: () => ({
    meta: [
      { title: "WebRTC Signaling & Peer Test — VOXONIX" },
      {
        name: "description",
        content: "Real-time WebSocket signaling WebRTC audio/video peer test page.",
      },
    ],
  }),
  component: WebRtcTestPage,
});

function WebRtcTestPage() {
  const {
    peerId,
    roomId,
    setRoomId,
    signalingStatus,
    peersCount,
    maxParticipants,
    camera,
    microphone,
    participants,
    diagnosticsMap,
    error,
    joinRoom,
    leaveRoom,
  } = usePeerConnection();

  const [inputRoomId, setInputRoomId] = useState<string>(roomId || "TEST01");

  const remoteParticipants = participants.slice(1);
  const isConnected = remoteParticipants.some((p) => p.connectionState === "connected");
  const isConnecting = signalingStatus === "connecting" || signalingStatus === "reconnecting";

  const handleStartLocalMedia = async () => {
    if (camera.state === "idle" || camera.state === "stopped") {
      await camera.startCamera();
    }
    if (microphone.state === "idle" || microphone.state === "stopped") {
      await microphone.startMicrophone();
    }
  };

  const handleJoinRoom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputRoomId.trim()) return;
    joinRoom(inputRoomId.trim());
  };

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-noir/70 transition-colors hover:text-noir"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <span className="font-mono text-xs uppercase tracking-widest text-crimson">
          [ WebRTC Mesh Diagnostics ]
        </span>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 sm:py-12 space-y-10">
        {/* Page Title & Overview */}
        <div className="space-y-3">
          <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight text-noir">
            WebRTC Mesh Signaling Testbed
          </h1>
          <p className="text-sm sm:text-base text-noir/70 max-w-3xl leading-relaxed">
            Multi-peer WebRTC mesh test page. Connects to the signaling server, exchanges SDP
            offers/answers and ICE candidates, and renders up to {maxParticipants} participants.
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-crimson/20 bg-crimson/10 p-4 text-crimson text-sm font-medium">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Signaling & Room Join Controls Box */}
        <div className="rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-noir/10 pb-4">
            <div>
              <h2 className="font-display text-xl text-noir">Signaling & Room Coordination</h2>
              <p className="text-xs text-noir/60">
                Join a room ID to initiate peer discovery with other participants.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SignalingBadge status={signalingStatus} />
              <ConnectionBadge
                state={isConnected ? "connected" : isConnecting ? "connecting" : "idle"}
              />
            </div>
          </div>

          <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 space-y-1.5 w-full">
              <label htmlFor="room-input" className="block text-xs font-semibold text-noir/70">
                Target Room Code
              </label>
              <input
                id="room-input"
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                placeholder="e.g. ROOM01"
                className="w-full rounded-2xl border border-noir/20 bg-background px-4 py-3 font-mono text-sm font-semibold uppercase text-noir placeholder:text-noir/30 focus:border-crimson focus:outline-none focus:ring-1 focus:ring-crimson"
              />
            </div>

            <div className="flex w-full sm:w-auto items-center gap-3">
              <button
                type="submit"
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-2xl bg-crimson px-6 py-3 text-xs font-semibold text-cream shadow-md transition hover:bg-wine"
              >
                <PhoneCall className="h-4 w-4" />
                Join Room
              </button>

              <button
                type="button"
                onClick={leaveRoom}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-2xl bg-noir/10 px-5 py-3 text-xs font-semibold text-noir hover:bg-noir/20 transition"
              >
                <PhoneOff className="h-4 w-4 text-wine" />
                Leave Room
              </button>
            </div>
          </form>
        </div>

        {/* Main Video Grid: Local vs Remote Participants */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-noir/10 pb-2">
            <h2 className="font-display text-2xl text-noir flex items-center gap-2">
              <Users className="h-5 w-5 text-crimson" />
              Active Mesh Video Grid ({participants.length}/{maxParticipants})
            </h2>
            <span className="text-xs font-medium text-noir/60 uppercase tracking-wider">
              Local Peer ({peerId})
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((p) => (
              <ParticipantTile
                key={p.peerId}
                peerId={p.peerId}
                displayName={p.displayName}
                stream={p.stream}
                isLocal={p.isLocal}
                audioEnabled={p.audioEnabled}
                videoEnabled={p.videoEnabled}
                connectionState={p.connectionState}
                className="aspect-video w-full"
              />
            ))}
          </div>
        </div>

        {/* Local Hardware Previews */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 pt-6 border-t border-noir/10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-noir font-display text-xl">
              <Video className="h-5 w-5 text-crimson" />
              <span>Camera Hardware Preview</span>
            </div>
            <CameraPreview />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-noir font-display text-xl">
              <Mic className="h-5 w-5 text-wine" />
              <span>Microphone Hardware Preview</span>
            </div>
            <MicrophonePreview />
          </div>
        </div>
      </main>
    </div>
  );
}

function SignalingBadge({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Connected
        </span>
      );
    case "connecting":
    case "reconnecting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
          <Radio className="h-3.5 w-3.5 animate-spin" />
          {status === "reconnecting" ? "Reconnecting..." : "Connecting..."}
        </span>
      );
    case "error":
    case "disconnected":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-noir/10 bg-noir/5 px-3 py-1 text-xs font-medium text-noir/60">
          <span className="h-2 w-2 rounded-full bg-noir/40" />
          {status}
        </span>
      );
  }
}

function ConnectionBadge({ state }: { state: string }) {
  switch (state) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          <Layers className="h-3.5 w-3.5" />
          Connected
        </span>
      );
    case "connecting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
          <Radio className="h-3.5 w-3.5 animate-spin" />
          Connecting...
        </span>
      );
    case "failed":
    case "disconnected":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-crimson/20 bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson">
          <AlertTriangle className="h-3.5 w-3.5" />
          {state}
        </span>
      );
    case "new":
    case "closed":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-noir/10 bg-noir/5 px-3 py-1 text-xs font-medium text-noir/60">
          Idle ({state})
        </span>
      );
  }
}
