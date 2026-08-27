import { useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, VideoOff, Maximize2, Minimize2, Sparkles } from "lucide-react";

export type FramingMode = "fill" | "gesture-safe";

export interface ParticipantTileProps {
  peerId: string;
  displayName: string;
  stream: MediaStream | null;
  isLocal: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  connectionState?: RTCPeerConnectionState;
  isFocused?: boolean;
  isPiP?: boolean;
  framingMode?: FramingMode;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  onToggleFraming?: () => void;
}

export function ParticipantTile({
  peerId,
  displayName,
  stream,
  isLocal,
  audioEnabled,
  videoEnabled,
  connectionState,
  isFocused = false,
  isPiP = false,
  framingMode = "fill",
  className = "",
  children,
  onClick,
  onToggleFraming,
}: ParticipantTileProps) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const attachStream = useCallback(
    (videoEl: HTMLVideoElement | null, mediaStream: MediaStream | null, isVideoOn: boolean) => {
      if (!videoEl) return;
      if (mediaStream && isVideoOn) {
        if (videoEl.srcObject !== mediaStream) {
          videoEl.srcObject = mediaStream;
        }
        videoEl.play().catch(() => {
          // Autoplay policy or gesture required
        });
      } else {
        videoEl.srcObject = null;
      }
    },
    [],
  );

  useEffect(() => {
    attachStream(videoElRef.current, stream, videoEnabled);
  }, [stream, videoEnabled, attachStream]);

  const hasLiveVideo = !!stream && videoEnabled;

  // Get user initials for fallback avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "PX";
  };

  const isGestureSafe = framingMode === "gesture-safe";

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-noir/20 bg-noir text-cream shadow-xl transition-all duration-200 ${
        isFocused ? "ring-2 ring-crimson/70 shadow-2xl" : ""
      } ${isPiP ? "shadow-2xl border-cream/30 ring-1 ring-noir/40" : ""} ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      aria-label={`Participant ${displayName}${isLocal ? " (You)" : ""}, Camera ${
        videoEnabled ? "On" : "Off"
      }, Microphone ${audioEnabled ? "On" : "Muted"}`}
    >
      {/* Ambient Backdrop for Gesture-Safe letterboxed mode */}
      {isGestureSafe && hasLiveVideo && (
        <div className="absolute inset-0 bg-gradient-to-b from-noir/90 via-noir to-noir/95 pointer-events-none" />
      )}

      {/* Video Element */}
      <video
        ref={(el) => {
          videoElRef.current = el;
          attachStream(el, stream, videoEnabled);
        }}
        autoPlay
        playsInline
        muted={isLocal}
        data-peer-id={peerId}
        data-is-local={isLocal ? "true" : "false"}
        data-mirror={isLocal ? "true" : "false"}
        className={`h-full w-full transition-all duration-300 ${
          isGestureSafe ? "object-contain p-1 sm:p-2" : "object-cover"
        } ${isLocal ? "video-mirrored" : "video-natural"} ${
          hasLiveVideo ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={
          isLocal
            ? { transform: "scaleX(-1)", WebkitTransform: "scaleX(-1)", scale: "none" }
            : { transform: "none", WebkitTransform: "none", scale: "none" }
        }
      />

      {/* Optional Overlay Children (e.g. Sign Recognition HUD) */}
      {children}

      {/* Camera Off / Fallback Overlay */}
      {!hasLiveVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-noir via-noir/95 to-wine/40">
          <div
            className={`flex items-center justify-center rounded-full bg-cream/10 text-cream/90 shadow-inner font-display font-bold tracking-wider border border-cream/15 ${
              isPiP ? "h-10 w-10 text-sm" : "h-16 w-16 sm:h-20 sm:w-20 text-xl sm:text-2xl"
            }`}
          >
            {getInitials(displayName)}
          </div>
          {!isPiP && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-cream/60 font-medium">
              <VideoOff className="h-3.5 w-3.5 text-crimson" />
              <span>Camera Off</span>
            </div>
          )}
        </div>
      )}

      {/* Top Right Controls & Status */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
        {/* Gesture-Safe Framing Indicator / Toggle Button (for remote non-PiP tiles) */}
        {!isLocal && !isPiP && onToggleFraming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFraming();
            }}
            className={`rounded-full px-2 py-1 text-[10px] font-semibold backdrop-blur-md transition flex items-center gap-1 ${
              isGestureSafe
                ? "bg-wine/90 text-cream border border-wine/40"
                : "bg-noir/70 text-cream/70 hover:bg-noir/90 hover:text-cream border border-cream/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
            title={
              isGestureSafe
                ? "Gesture-Safe Framing Active (Full Video). Click to fill frame."
                : "Click for Gesture-Safe Framing (Full Hands & Upper Body for Signing)"
            }
          >
            {isGestureSafe ? (
              <>
                <Sparkles className="h-3 w-3 text-amber-300" />
                <span className="hidden sm:inline">Gesture Safe</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3 w-3" />
                <span className="hidden sm:inline">Framing</span>
              </>
            )}
          </button>
        )}

        {/* Connection State Badge */}
        {connectionState && connectionState !== "connected" && !isLocal && (
          <div className="rounded-full bg-noir/80 px-2.5 py-1 text-[10px] font-semibold text-amber-400 backdrop-blur-md border border-amber-400/20">
            {connectionState === "connecting"
              ? "Connecting..."
              : connectionState === "disconnected"
                ? "Reconnecting..."
                : connectionState}
          </div>
        )}
      </div>

      {/* Bottom Left Identity & Microphone Pill */}
      <div
        className={`absolute bottom-2.5 left-2.5 z-10 flex items-center justify-between gap-2 rounded-full bg-noir/85 backdrop-blur-md border border-cream/10 shadow-md ${
          isPiP ? "px-2 py-0.5 max-w-[calc(100%-1rem)]" : "px-3 py-1.5 max-w-[calc(100%-1.25rem)]"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              isLocal || connectionState === "connected" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span
            className={`truncate font-semibold text-cream ${isPiP ? "text-[10px]" : "text-xs"}`}
            title={`${displayName}${isLocal ? " (You)" : ""}`}
            suppressHydrationWarning
          >
            {displayName} {isLocal && "(You)"}
          </span>
        </div>

        {/* Audio State Badge */}
        <div className="shrink-0 flex items-center gap-1 pl-1">
          {audioEnabled ? (
            <span
              className="inline-flex items-center text-emerald-400 text-[11px]"
              title="Microphone Active"
            >
              <Mic className={isPiP ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-crimson text-[11px] font-medium"
              title="Microphone Muted"
            >
              <MicOff className={isPiP ? "h-3 w-3" : "h-3.5 w-3.5"} />
              {!isPiP && <span className="hidden xs:inline text-[10px]">Muted</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
