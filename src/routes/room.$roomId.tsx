import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Copy,
  Check,
  Activity,
  ArrowLeft,
  ShieldAlert,
  Sparkles,
  Accessibility,
  Sliders,
  MessageSquare,
  Volume2,
  VolumeX,
  Keyboard,
  Hand,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useAccessibility } from "@/context/accessibility-context";
import { useTTS } from "@/context/tts-context";
import { useSignRecognitionContext } from "@/context/sign-recognition-context";
import { usePeerConnection, type Participant } from "@/hooks/use-peer-connection";
import { ParticipantTile, type FramingMode } from "@/components/media/ParticipantTile";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { useSpeechOutput } from "@/hooks/use-speech-output";
import { useSignRecognition } from "@/hooks/use-sign-recognition";
import { CaptionsOverlay } from "@/components/media/CaptionsOverlay";
import { TTSQuickSpeechBar } from "@/components/media/TTSQuickSpeechBar";
import { AccessibilityControlPanel } from "@/components/media/AccessibilityControlPanel";
import { SignRecognitionHUD } from "@/components/media/SignRecognitionHUD";
import { InteractiveBackground } from "@/components/InteractiveBackground";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomComponent,
  head: () => ({
    meta: [
      { title: "1-to-1 Call — VOXONIX" },
      {
        name: "description",
        content: "Unified accessible 1-to-1 real-time video, speech, sign, and text communication room.",
      },
    ],
  }),
});

function RoomComponent() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, profileInfo, preferences } = useAccessibility();

  // Derive authenticated display name
  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "You";

  // Pre-call readiness gate: ensures user confirms camera/mic & unlocks audio gesture
  const [hasEnteredCall, setHasEnteredCall] = useState(false);

  const {
    peerId,
    signalingStatus,
    camera,
    microphone,
    participants,
    diagnosticsMap,
    isRoomFull,
    roomState,
    localVideoEnabled,
    localAudioEnabled,
    captions,
    signaling,
    broadcastCaption,
    leaveCall,
  } = usePeerConnection({
    initialRoomId: roomId,
    autoJoin: hasEnteredCall,
    displayName,
  });

  const cameraIsLive = localVideoEnabled;
  const micIsAvailable = microphone.state === "live";

  // UI state for 1-to-1 call
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(preferences.captionsEnabled);
  const [isAccessibilityPanelOpen, setIsAccessibilityPanelOpen] = useState(false);
  const [isTypeToSpeakOpen, setIsTypeToSpeakOpen] = useState(preferences.typeToSpeakEnabled);
  const [isGestureSafe, setIsGestureSafe] = useState(preferences.gestureSafeFraming);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Sync preferences on initial mount
  useEffect(() => {
    setIsCaptionsEnabled(preferences.captionsEnabled);
    setIsGestureSafe(preferences.gestureSafeFraming);
  }, [preferences]);

  // Strictly gated developer debug mode: DEV mode + ?debug=true query parameter
  const isDevDebug = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "true"
    );
  }, []);

  // Text-to-Speech (TTS) & Speech Output Engine
  const {
    config: ttsConfig,
    enableWithGesture,
  } = useTTS();

  const {
    isSpeaking: isTTSSpeaking,
    isMicDucked,
    telemetry: ttsTelemetry,
    speakTypedText,
    isAcousticEcho,
  } = useSpeechOutput({
    localPeerId: peerId,
    localDisplayName: displayName,
    captions,
    broadcastCaption,
  });

  // Client-Side Sign Recognition (Vision Landmark & Handshape Classifier)
  const { config: signConfig } = useSignRecognitionContext();
  const {
    isModelLoading: isSignModelLoading,
    telemetry: signTelemetry,
    currentResult: currentSignResult,
    lastObservation: lastSignObservation,
    benchmarkResult,
    finalizeWord: finalizeSignWord,
    backspace: backspaceSignWord,
    clearBuffer: clearSignBuffer,
    runBenchmark,
  } = useSignRecognition({
    localPeerId: peerId,
    localDisplayName: displayName,
    isCameraLive: cameraIsLive,
    getVideoElement: () => {
      if (typeof document === "undefined") return null;
      return document.querySelector<HTMLVideoElement>(`video[data-is-local="true"]`);
    },
    broadcastCaption,
  });

  // Live Speech-to-Text Recognition Hook (Runs on speaker's mic stream when unmuted)
  const {
    systemState: sttSystemState,
    activeProviderName,
    telemetry: sttTelemetry,
    simulateSpeech,
  } = useSpeechToText({
    isMicMuted: microphone.isMuted,
    isAudioLive: localAudioEnabled,
    speakerPeerId: peerId,
    speakerDisplayName: displayName,
    signaling,
    getAudioTrack: () => microphone.stream?.getAudioTracks()[0] || null,
    onCaptionGenerated: broadcastCaption,
    isDucked: isMicDucked,
    isAcousticEcho,
  });

  // Primary 1-to-1 remote and local participants
  const localParticipant = participants[0];
  const remoteParticipant = useMemo(() => {
    const remote = participants.find((p) => !p.isLocal);
    return remote || null;
  }, [participants]);

  const isAlone = !remoteParticipant;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied("code");
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied("link");
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleLeaveCall = () => {
    leaveCall();
    navigate({ to: "/dashboard" });
  };

  const handleEnterCall = async () => {
    // Satisfy browser user-gesture policy for audio output
    if (preferences.speechOutputEnabled || profile === "blind" || profile === "non-speaking") {
      try {
        await enableWithGesture();
      } catch {
        // Continue even if browser blocks speech
      }
    }
    setHasEnteredCall(true);
  };

  // ── 1. Pre-Call Readiness Check Screen ────────────────────────────────────
  if (!hasEnteredCall) {
    return (
      <div className="relative min-h-[100dvh] flex flex-col bg-background text-noir selection:bg-crimson/20">
        <InteractiveBackground />

        {/* Top bar */}
        <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/dashboard" className="flex items-center gap-1.5 text-sm font-semibold text-noir/70 hover:text-crimson transition">
            <ArrowLeft className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[20px] italic text-wine">Voxonix</span>
            <span className="font-display text-[20px] font-medium tracking-[0.04em] text-noir">✕ AI</span>
          </div>
          <span className="text-xs font-mono font-bold uppercase text-noir/60 bg-noir/5 px-2.5 py-1 rounded-full">
            Room {roomId}
          </span>
        </header>

        {/* Center Readiness Card */}
        <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-crimson">
                Pre-Call Readiness
              </span>
              <h1 className="mt-1 font-display text-3xl sm:text-4xl font-bold text-noir">
                Ready to communicate?
              </h1>
              <p className="mt-1.5 text-xs text-noir/65">
                Check your hardware and communication preferences before entering room{" "}
                <strong className="font-mono text-noir">{roomId}</strong>.
              </p>
            </div>

            {/* Hardware Status Preview */}
            <div className="space-y-3 rounded-2xl border border-noir/10 bg-background/60 p-4">
              {/* Camera Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    cameraIsLive ? "bg-emerald-100 text-emerald-800" : "bg-noir/10 text-noir/60"
                  }`}>
                    {cameraIsLive ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-noir">Camera</p>
                    <p className="text-[10px] text-noir/50">
                      {cameraIsLive ? "Active & Ready" : "Camera Off / Disabled"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (cameraIsLive) camera.stopCamera();
                    else camera.startCamera();
                  }}
                  className="rounded-lg border border-noir/15 bg-card px-2.5 py-1 text-xs font-semibold text-noir hover:border-noir transition"
                >
                  {cameraIsLive ? "Turn Off" : "Turn On"}
                </button>
              </div>

              {/* Microphone Status */}
              <div className="flex items-center justify-between border-t border-noir/10 pt-3">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    !microphone.isMuted ? "bg-emerald-100 text-emerald-800" : "bg-crimson/10 text-crimson"
                  }`}>
                    {!microphone.isMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-noir">Microphone</p>
                    <p className="text-[10px] text-noir/50">
                      {!microphone.isMuted ? "Active & Capturing" : "Muted"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={microphone.toggleMute}
                  className="rounded-lg border border-noir/15 bg-card px-2.5 py-1 text-xs font-semibold text-noir hover:border-noir transition"
                >
                  {microphone.isMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            </div>

            {/* Profile Default Features Checklist */}
            <div className="mt-4 rounded-2xl border border-noir/10 bg-background/40 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-noir/70 pb-1 border-b border-noir/10">
                <span>Active Mode: {profileInfo?.label || "Standard"}</span>
                <span className="text-crimson">{profileInfo?.modeDescription || "Balanced"}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-2 text-noir">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Captions {isCaptionsEnabled ? "Enabled" : "Off"}</span>
                </div>
                <div className="flex items-center gap-2 text-noir">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Speech Output {ttsConfig.enabled || preferences.speechOutputEnabled ? "Ready" : "Off"}</span>
                </div>
                <div className="flex items-center gap-2 text-noir">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Sign Recognition {signConfig.enabled ? "Enabled" : "Off"}</span>
                </div>
                <div className="flex items-center gap-2 text-noir">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Type to Speak Ready</span>
                </div>
              </div>
            </div>

            {/* Big Enter Call Action */}
            <div className="mt-6 space-y-2.5">
              <button
                id="btn-enter-call"
                onClick={handleEnterCall}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-crimson py-3.5 text-sm font-bold text-cream shadow-md transition hover:bg-wine focus:ring-2 focus:ring-crimson"
              >
                <span>Enter Call Room</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="w-full text-center text-xs text-noir/60 hover:text-crimson transition"
              >
                {copied === "link" ? "Room Link Copied!" : "Copy room invite link"}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── 2. Active 1-to-1 Call Screen ──────────────────────────────────────────
  return (
    <div className="flex min-h-[100dvh] h-[100dvh] w-full flex-col bg-background text-noir selection:bg-crimson/20 select-none overflow-hidden relative">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-30 shrink-0 border-b border-noir/10 bg-card/85 px-4 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          {/* Left: Back Link & Room Code */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 text-xs font-semibold text-noir/70 hover:text-crimson transition"
              title="Return to Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>

            <div className="h-4 w-px bg-noir/15 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-noir uppercase">
                ROOM <span className="rounded bg-noir/5 px-1.5 py-0.5">{roomId}</span>
              </span>
              <button
                onClick={handleCopyCode}
                className="group rounded p-1 text-noir/40 hover:bg-noir/5 hover:text-noir transition"
                title="Copy Room ID"
                aria-label="Copy Room ID"
              >
                {copied === "code" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-noir/40 group-hover:text-crimson" />
                )}
              </button>
            </div>
          </div>

          {/* Center: Brand Mark */}
          <div className="hidden md:flex items-baseline gap-1.5">
            <span className="font-display text-[18px] italic text-wine">Voxonix</span>
            <span className="font-display text-[18px] font-medium tracking-[0.04em] text-noir">✕ AI</span>
          </div>

          {/* Right: Live Connection State & Copy Link */}
          <div className="flex items-center gap-2">
            {/* Live Signaling Connection State Dot */}
            <div
              className="flex items-center gap-1.5 rounded-full border border-noir/10 bg-background/80 px-2.5 py-1 text-xs"
              title={`Signaling: ${signalingStatus} | Room: ${roomState}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  signalingStatus === "connected"
                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                    : signalingStatus === "connecting" || signalingStatus === "reconnecting"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-crimson"
                }`}
              />
              <span className="text-[11px] font-medium text-noir/70 capitalize">
                {signalingStatus === "connected" ? "Live" : signalingStatus}
              </span>
            </div>

            <button
              onClick={handleCopyLink}
              className="hidden sm:inline-flex items-center gap-1 rounded-full border border-noir/10 bg-background/80 px-2.5 py-1 text-xs font-semibold text-noir hover:bg-noir/5 transition"
            >
              <Copy className="h-3 w-3 text-noir/50" />
              <span>{copied === "link" ? "Copied!" : "Invite Link"}</span>
            </button>

            {/* Developer Diagnostics Toggle (Gated to Dev + ?debug=true) */}
            {isDevDebug && (
              <button
                id="btn-toggle-diagnostics"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className={`rounded-full p-1.5 transition ${
                  showDiagnostics
                    ? "bg-noir text-cream"
                    : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                }`}
                title="Toggle Diagnostics (Dev Mode)"
              >
                <Activity className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Developer Diagnostics Drawer (Dev + ?debug=true gated) ──────────── */}
      {isDevDebug && showDiagnostics && (
        <aside
          className="relative z-30 border-b border-noir/10 bg-card/95 px-4 py-3 shadow-md backdrop-blur-md animate-in slide-in-from-top-2"
          role="region"
          aria-label="Call Diagnostics"
        >
          <div className="mx-auto max-w-6xl space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-noir">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-crimson" />
                Mesh WebRTC, STT & TTS Diagnostics
              </span>
              <button onClick={() => setShowDiagnostics(false)} className="text-noir/50 hover:text-noir">
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="rounded-lg border border-noir/10 bg-background/50 p-2">
                <span className="text-noir/50 block">Local Peer ID</span>
                <span className="font-mono font-bold text-noir truncate block">{peerId}</span>
              </div>
              <div className="rounded-lg border border-noir/10 bg-background/50 p-2">
                <span className="text-noir/50 block">STT State / Provider</span>
                <span className="font-semibold text-emerald-700">{sttSystemState} ({activeProviderName})</span>
              </div>
              <div className="rounded-lg border border-noir/10 bg-background/50 p-2">
                <span className="text-noir/50 block">Speech Output (TTS)</span>
                <span className="font-semibold text-wine">{ttsConfig.enabled ? "Active" : "Disabled"}</span>
              </div>
              <div className="rounded-lg border border-noir/10 bg-background/50 p-2">
                <span className="text-noir/50 block">Sign Vision Model</span>
                <span className="font-semibold text-amber-700">{signConfig.enabled ? (isSignModelLoading ? "Loading..." : "Ready") : "Off"}</span>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main 1-to-1 Call Stage ─────────────────────────────────────────── */}
      <main className="relative flex-1 overflow-hidden p-2 sm:p-4 flex items-center justify-center">
        {/* Room Full Error */}
        {isRoomFull ? (
          <div className="mx-auto max-w-md rounded-3xl border border-crimson/20 bg-card p-8 text-center shadow-2xl">
            <ShieldAlert className="mx-auto h-12 w-12 text-crimson mb-4" />
            <h2 className="font-display text-2xl font-bold text-noir">Room is Full</h2>
            <p className="mt-2 text-sm text-noir/70">
              This 1-to-1 room is currently occupied by 2 participants.
            </p>
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-noir px-6 py-2.5 text-xs font-semibold text-cream"
            >
              Return to Dashboard
            </button>
          </div>
        ) : (
          <div className="relative h-full w-full max-w-6xl flex flex-col justify-center">
            {/* 1-to-1 Video Stage */}
            <div className="relative h-full w-full flex items-center justify-center">
              {remoteParticipant ? (
                /* Remote Participant Dominant Screen */
                <div className="relative h-full w-full max-h-[80vh] aspect-video rounded-3xl overflow-hidden shadow-2xl border border-noir/15 bg-black/90">
                  <ParticipantTile
                    peerId={remoteParticipant.peerId}
                    displayName={remoteParticipant.displayName}
                    stream={remoteParticipant.stream}
                    isLocal={false}
                    audioEnabled={remoteParticipant.audioEnabled}
                    videoEnabled={remoteParticipant.videoEnabled}
                    connectionState={remoteParticipant.connectionState}
                    isFocused={true}
                    framingMode={isGestureSafe ? "gesture-safe" : "fill"}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                /* Waiting State when alone */
                <div className="relative h-full w-full max-h-[80vh] aspect-video rounded-3xl overflow-hidden shadow-2xl border border-noir/15 bg-card/60 flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-crimson/10 text-crimson">
                    <Users className="h-8 w-8" />
                    <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-amber-500 animate-ping" />
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-noir">
                    Waiting for partner to join...
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm text-noir/65 max-w-md">
                    Share your 6-character room code <strong className="font-mono font-bold text-noir uppercase">{roomId}</strong> or send them the invite link.
                  </p>
                  <button
                    onClick={handleCopyLink}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-noir px-6 py-2.5 text-xs font-semibold text-cream shadow transition hover:bg-crimson"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copied === "link" ? "Link Copied!" : "Copy Invite Link"}</span>
                  </button>
                </div>
              )}

              {/* Floating Local Selfie PiP (Mirrored, bottom-right on desktop, top-right on mobile) */}
              <div
                className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 border-card transition hover:scale-105"
                title="Your Camera View (Mirrored)"
              >
                {localParticipant && (
                  <ParticipantTile
                    peerId={localParticipant.peerId}
                    displayName="You"
                    stream={localParticipant.stream}
                    isLocal={true}
                    audioEnabled={localParticipant.audioEnabled}
                    videoEnabled={localParticipant.videoEnabled}
                    isPiP={true}
                    className="h-full w-full"
                  >
                    {signConfig.enabled && cameraIsLive && signConfig.showHUD && (
                      <SignRecognitionHUD
                        observation={lastSignObservation}
                        result={currentSignResult}
                        bufferedWord={signTelemetry?.bufferedWord}
                        stabilityThresholdMs={signConfig.stabilityThresholdMs}
                        onFinalize={finalizeSignWord}
                        onBackspace={backspaceSignWord}
                        onClear={clearSignBuffer}
                      />
                    )}
                  </ParticipantTile>
                )}
              </div>
            </div>

            {/* ── Type to Speak Floating Interface (for Non-speaking users) ─── */}
            <TTSQuickSpeechBar
              isOpen={isTypeToSpeakOpen}
              onClose={() => setIsTypeToSpeakOpen(false)}
              onSpeak={(txt) => speakTypedText(txt)}
              className="absolute bottom-16 sm:bottom-20 inset-x-0 z-30 pointer-events-auto"
            />

            {/* ── Real-Time Live Closed Captions Floating Subtitles ─────────── */}
            {isCaptionsEnabled && captions.length > 0 && (
              <div className="absolute bottom-2 sm:bottom-4 inset-x-0 z-20 pointer-events-none flex justify-center">
                <CaptionsOverlay
                  captions={captions}
                  isLocalSpeakerId={peerId}
                  variant={isGestureSafe ? "gesture-safe" : "default"}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Structured Accessibility Control Panel ─────────────────────── */}
        <AccessibilityControlPanel
          isOpen={isAccessibilityPanelOpen}
          onClose={() => setIsAccessibilityPanelOpen(false)}
          onOpenTypeToSpeak={() => setIsTypeToSpeakOpen(true)}
          isCaptionsEnabled={isCaptionsEnabled}
          onToggleCaptions={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
          isGestureSafe={isGestureSafe}
          onToggleGestureSafe={() => setIsGestureSafe(!isGestureSafe)}
        />
      </main>

      {/* ── Persistent Bottom Call Control Dock ───────────────────────────── */}
      <footer
        className="relative z-30 shrink-0 border-t border-noir/10 bg-card/90 px-3 sm:px-4 py-3 backdrop-blur-md"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between sm:justify-center gap-2 sm:gap-4">
          {/* Microphone Mute / Unmute */}
          <button
            id="btn-toggle-mic"
            onClick={microphone.toggleMute}
            disabled={!micIsAvailable}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold shadow-md transition disabled:opacity-50 ${
              microphone.isMuted
                ? "bg-crimson text-cream hover:bg-wine"
                : "bg-noir text-cream hover:bg-noir/80"
            }`}
            aria-label={microphone.isMuted ? "Unmute Microphone" : "Mute Microphone"}
            title={microphone.isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {microphone.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-400" />}
            <span className="hidden xs:inline">{microphone.isMuted ? "Muted" : "Mic On"}</span>
          </button>

          {/* Camera On / Off */}
          <button
            id="btn-toggle-camera"
            onClick={() => {
              if (cameraIsLive) camera.stopCamera();
              else camera.startCamera();
            }}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold shadow-md transition ${
              cameraIsLive
                ? "bg-noir text-cream hover:bg-noir/80"
                : "bg-wine text-cream hover:bg-noir"
            }`}
            aria-label={cameraIsLive ? "Turn Camera Off" : "Turn Camera On"}
            title={cameraIsLive ? "Turn Camera Off" : "Turn Camera On"}
          >
            {cameraIsLive ? <Video className="h-4 w-4 text-emerald-400" /> : <VideoOff className="h-4 w-4 text-crimson" />}
            <span className="hidden xs:inline">{cameraIsLive ? "Camera" : "Camera Off"}</span>
          </button>

          {/* Closed Captions (CC) */}
          <button
            id="btn-toggle-captions"
            onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
            className={`inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold shadow-md transition ${
              isCaptionsEnabled
                ? "bg-noir text-cream ring-2 ring-crimson/50"
                : "bg-noir/10 text-noir/70 hover:bg-noir/20"
            }`}
            aria-label={isCaptionsEnabled ? "Disable Captions" : "Enable Captions"}
            title={isCaptionsEnabled ? "Captions Visible (Click to Hide)" : "Captions Hidden (Click to Show)"}
          >
            <MessageSquare className="h-4 w-4" />
            <span>CC</span>
          </button>

          {/* Accessibility Control Panel (♿) */}
          <button
            id="btn-toggle-accessibility-panel"
            onClick={() => setIsAccessibilityPanelOpen(!isAccessibilityPanelOpen)}
            className={`inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold shadow-md transition ${
              isAccessibilityPanelOpen
                ? "bg-crimson text-cream ring-2 ring-crimson"
                : "bg-noir/10 text-noir hover:bg-noir/20"
            }`}
            aria-label="Open Accessibility Menu"
            title="Accessibility Menu (Speech output, Type to speak, Sign recognition)"
          >
            <Accessibility className="h-4 w-4" />
            <span className="hidden sm:inline">Access</span>
          </button>

          {/* Leave Call */}
          <button
            id="btn-leave-call"
            onClick={handleLeaveCall}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-crimson px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold text-cream shadow-md transition hover:bg-wine"
            aria-label="Leave Call"
            title="Leave Call"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden xs:inline">Leave</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
