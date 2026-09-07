import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Mic, MicOff, VideoOff, Maximize2, Sparkles, Loader2, AlertCircle } from "lucide-react";

export type FramingMode = "fill" | "gesture-safe";

export type VideoRenderState =
  | "VIDEO_ERROR"
  | "NO_REMOTE_TRACK"
  | "TRACK_LIVE_VIDEO_OFF"
  | "TRACK_LIVE_VIDEO_ON"
  | "VIDEO_DECODING";

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
  const [isDecodingConfirmed, setIsDecodingConfirmed] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [trackLiveState, setTrackLiveState] = useState<{
    trackExists: boolean;
    readyState: MediaStreamTrackState;
    enabled: boolean;
    muted: boolean;
  }>({
    trackExists: false,
    readyState: "ended",
    enabled: false,
    muted: false,
  });

  // Lifecycle forensic timestamps
  const lifecycleRef = useRef<{
    attachedAt?: number;
    metadataAt?: number;
    canplayAt?: number;
    playingAt?: number;
    firstFrameAt?: number;
    framesDecoded: number;
    rvfcHandle?: number;
  }>({ framesDecoded: 0 });

  // ── Track inspections & Event Listeners ─────────────────────────────────────
  const primaryTrack = useMemo(() => {
    if (!stream) return null;
    const vTracks = stream.getVideoTracks();
    return vTracks.length > 0 ? vTracks[0] : null;
  }, [stream]);

  useEffect(() => {
    if (!primaryTrack) {
      setTrackLiveState({
        trackExists: false,
        readyState: "ended",
        enabled: false,
        muted: false,
      });
      setIsDecodingConfirmed(false);
      return;
    }

    const updateTrackState = () => {
      setTrackLiveState({
        trackExists: true,
        readyState: primaryTrack.readyState,
        enabled: primaryTrack.enabled,
        muted: primaryTrack.muted,
      });
    };

    updateTrackState();

    const handleMute = () => {
      console.log(`[ParticipantTile][${peerId}] videoTrack muted (isLocal=${isLocal})`);
      updateTrackState();
      setIsDecodingConfirmed(false);
    };

    const handleUnmute = () => {
      console.log(`[ParticipantTile][${peerId}] videoTrack unmuted (isLocal=${isLocal})`);
      updateTrackState();
    };

    const handleEnded = () => {
      console.log(`[ParticipantTile][${peerId}] videoTrack ended (isLocal=${isLocal})`);
      updateTrackState();
      setIsDecodingConfirmed(false);
    };

    primaryTrack.addEventListener("mute", handleMute);
    primaryTrack.addEventListener("unmute", handleUnmute);
    primaryTrack.addEventListener("ended", handleEnded);

    return () => {
      primaryTrack.removeEventListener("mute", handleMute);
      primaryTrack.removeEventListener("unmute", handleUnmute);
      primaryTrack.removeEventListener("ended", handleEnded);
    };
  }, [primaryTrack, peerId, isLocal]);

  // ── Stream Attachment & Playback Lifecycle ──────────────────────────────────
  const attachStream = useCallback(
    (videoEl: HTMLVideoElement | null, mediaStream: MediaStream | null, isVideoOn: boolean) => {
      if (!videoEl) return;

      const vTracks = mediaStream ? mediaStream.getVideoTracks() : [];
      const hasTrack = vTracks.length > 0;

      if (mediaStream && isVideoOn && hasTrack) {
        if (videoEl.srcObject !== mediaStream) {
          lifecycleRef.current = {
            attachedAt: performance.now(),
            framesDecoded: 0,
          };
          console.log(
            `[ParticipantTile][${peerId}] Attaching ${isLocal ? "local" : "remote"} stream (vTracks=${vTracks.length} readyState=${vTracks[0].readyState})`,
          );
          videoEl.srcObject = mediaStream;
          setPlaybackError(null);
        }

        videoEl
          .play()
          .then(() => {
            if (!lifecycleRef.current.playingAt) {
              lifecycleRef.current.playingAt = performance.now();
            }
          })
          .catch((err) => {
            const errName = err instanceof Error ? err.name : String(err);
            if (errName !== "AbortError") {
              console.warn(
                `[ParticipantTile][${peerId}] play() deferred/blocked (isLocal=${isLocal}):`,
                err,
              );
              setPlaybackError(errName);
            }
          });
      } else {
        if (videoEl.srcObject !== null) {
          console.log(
            `[ParticipantTile][${peerId}] Detaching stream (isVideoOn=${isVideoOn} hasTrack=${hasTrack})`,
          );
          videoEl.srcObject = null;
        }
        setIsDecodingConfirmed(false);
      }
    },
    [isLocal, peerId],
  );

  useEffect(() => {
    attachStream(videoElRef.current, stream, videoEnabled);
  }, [stream, videoEnabled, attachStream]);

  // ── Multi-Tier Frame Decoding Verification ──────────────────────────────────
  useEffect(() => {
    const videoEl = videoElRef.current;
    if (!videoEl || !primaryTrack || !videoEnabled || primaryTrack.readyState !== "live") {
      setIsDecodingConfirmed(false);
      return;
    }

    let isMounted = true;

    // Hierarchy Tier 1: requestVideoFrameCallback (Standard in Chromium, Safari 15.4+, Firefox 128+)
    if (
      "requestVideoFrameCallback" in videoEl &&
      typeof videoEl.requestVideoFrameCallback === "function"
    ) {
      const onFrame = (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
        if (!isMounted) return;
        if (!lifecycleRef.current.firstFrameAt) {
          lifecycleRef.current.firstFrameAt = now;
          const delta = lifecycleRef.current.attachedAt
            ? Math.round(now - lifecycleRef.current.attachedAt)
            : 0;
          console.log(
            `[ParticipantTile][${peerId}] FIRST DECODED FRAME in ${delta}ms (${metadata.width}x${metadata.height})`,
          );
        }
        lifecycleRef.current.framesDecoded++;
        setIsDecodingConfirmed(true);

        // Schedule next frame poll
        lifecycleRef.current.rvfcHandle = videoEl.requestVideoFrameCallback(onFrame);
      };

      lifecycleRef.current.rvfcHandle = videoEl.requestVideoFrameCallback(onFrame);

      return () => {
        isMounted = false;
        if (lifecycleRef.current.rvfcHandle && "cancelVideoFrameCallback" in videoEl) {
          videoEl.cancelVideoFrameCallback(lifecycleRef.current.rvfcHandle);
        }
      };
    }

    // Hierarchy Tier 2: getVideoPlaybackQuality (Standard Video Quality API)
    const checkPlaybackQuality = () => {
      if (!isMounted) return;
      if (
        "getVideoPlaybackQuality" in videoEl &&
        typeof videoEl.getVideoPlaybackQuality === "function"
      ) {
        const quality = videoEl.getVideoPlaybackQuality();
        if (quality && quality.totalVideoFrames > 0) {
          if (!lifecycleRef.current.firstFrameAt) {
            lifecycleRef.current.firstFrameAt = performance.now();
            console.log(
              `[ParticipantTile][${peerId}] Decoded frames confirmed via PlaybackQuality (${quality.totalVideoFrames} frames)`,
            );
          }
          setIsDecodingConfirmed(true);
          return;
        }
      }

      // Hierarchy Tier 3: Universal Fallback (dimensions > 0 + readyState >= HAVE_CURRENT_DATA)
      if (
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !videoEl.paused &&
        !videoEl.ended
      ) {
        if (!lifecycleRef.current.firstFrameAt) {
          lifecycleRef.current.firstFrameAt = performance.now();
          console.log(
            `[ParticipantTile][${peerId}] Decoded frames confirmed via Dimension/ReadyState fallback (${videoEl.videoWidth}x${videoEl.videoHeight})`,
          );
        }
        setIsDecodingConfirmed(true);
      }
    };

    const interval = setInterval(checkPlaybackQuality, 200);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [primaryTrack, videoEnabled, peerId]);

  // ── Explicit Video Rendering State Priority ─────────────────────────────────
  const videoState: VideoRenderState = useMemo(() => {
    if (playbackError) return "VIDEO_ERROR";
    if (!trackLiveState.trackExists || trackLiveState.readyState === "ended") {
      return "NO_REMOTE_TRACK";
    }
    if (!videoEnabled || !trackLiveState.enabled || trackLiveState.muted) {
      return "TRACK_LIVE_VIDEO_OFF";
    }
    if (isDecodingConfirmed) {
      return "VIDEO_DECODING";
    }
    return "TRACK_LIVE_VIDEO_ON";
  }, [playbackError, trackLiveState, videoEnabled, isDecodingConfirmed]);

  // Initials for avatar fallback
  const getInitials = (name: string) => {
    const clean = name.replace(/\(You\)/gi, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || "PX";
  };

  const isGestureSafe = framingMode === "gesture-safe";

  // Canonical presentation: (You) is ONLY added for isLocal === true
  const presentationName = isLocal
    ? displayName
      ? `${displayName} (You)`
      : "You"
    : displayName || "Participant";

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-noir/20 bg-noir text-cream shadow-xl transition-all duration-200 ${
        isFocused ? "ring-2 ring-crimson/70 shadow-2xl" : ""
      } ${isPiP ? "shadow-2xl border-cream/30 ring-1 ring-noir/40" : ""} ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      aria-label={`Participant ${presentationName}, Camera ${
        videoEnabled ? "On" : "Off"
      }, Microphone ${audioEnabled ? "On" : "Muted"}`}
    >
      {/* ── Single Authority Video Element ───────────────────────────────── */}
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
        onLoadedMetadata={(e) => {
          lifecycleRef.current.metadataAt = performance.now();
          const v = e.currentTarget;
          console.log(
            `[ParticipantTile][${peerId}] loadedmetadata: ${v.videoWidth}x${v.videoHeight} (isLocal=${isLocal})`,
          );
        }}
        onCanPlay={() => {
          lifecycleRef.current.canplayAt = performance.now();
          console.log(`[ParticipantTile][${peerId}] canplay (isLocal=${isLocal})`);
        }}
        onPlaying={() => {
          lifecycleRef.current.playingAt = performance.now();
          console.log(`[ParticipantTile][${peerId}] playing (isLocal=${isLocal})`);
        }}
        className={`relative z-10 h-full w-full transition-opacity duration-300 ${
          isGestureSafe ? "object-contain p-1 sm:p-2" : "object-cover"
        } ${isLocal ? "video-mirrored" : "video-natural"} ${
          videoState === "VIDEO_DECODING" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Optional Overlay Children (e.g. Sign Recognition HUD) */}
      {children}

      {/* ── Fallback Overlay (Driven Strictly by State Machine) ───────────── */}
      {videoState !== "VIDEO_DECODING" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-noir via-noir/95 to-wine/40">
          <div
            className={`flex items-center justify-center rounded-full bg-cream/10 text-cream/90 shadow-inner font-display font-bold tracking-wider border border-cream/15 ${
              isPiP ? "h-10 w-10 text-sm" : "h-16 w-16 sm:h-20 sm:w-20 text-xl sm:text-2xl"
            }`}
          >
            {getInitials(displayName)}
          </div>

          {!isPiP && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-cream/60 font-medium">
              {videoState === "TRACK_LIVE_VIDEO_OFF" ? (
                <>
                  <VideoOff className="h-3.5 w-3.5 text-crimson" />
                  <span>Camera Off</span>
                </>
              ) : videoState === "TRACK_LIVE_VIDEO_ON" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                  <span>Connecting video...</span>
                </>
              ) : videoState === "VIDEO_ERROR" ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-crimson" />
                  <span>Video Unavailable</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Waiting for video...</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top Right Controls & Status */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        {/* Gesture-Safe Framing Toggle (for remote non-PiP tiles) */}
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
        className={`absolute bottom-2.5 left-2.5 z-20 flex items-center justify-between gap-2 rounded-full bg-noir/85 backdrop-blur-md border border-cream/10 shadow-md ${
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
            title={presentationName}
            suppressHydrationWarning
          >
            {presentationName}
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
