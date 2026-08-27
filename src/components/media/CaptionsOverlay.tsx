import { useMemo } from "react";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

interface CaptionsOverlayProps {
  captions: CaptionPayload[];
  isLocalSpeakerId?: string;
  variant?: "default" | "gesture-safe" | "mobile";
  className?: string;
}

export function CaptionsOverlay({
  captions,
  isLocalSpeakerId,
  variant = "default",
  className = "",
}: CaptionsOverlayProps) {
  // Extract latest finalized utterance for screen-reader live announcements
  const latestFinalUtterance = useMemo(() => {
    const finals = captions.filter((c) => c.isFinal);
    return finals[finals.length - 1];
  }, [captions]);

  // Visible subtitle presentation: display only the active interim caption + 1 recent line (max 2 lines)
  const visibleSubtitles = useMemo(() => {
    return captions.slice(-2);
  }, [captions]);

  if (visibleSubtitles.length === 0) {
    return null;
  }

  // Adaptive positioning classes based on variant / gesture-safe mode
  const placementClass =
    variant === "gesture-safe"
      ? "bottom-2 sm:bottom-3 max-w-lg"
      : variant === "mobile"
        ? "bottom-2 max-w-full px-2"
        : "bottom-2 sm:bottom-3 max-w-xl";

  return (
    <section
      aria-label="Live Subtitles"
      className={`pointer-events-none relative z-20 mx-auto w-full px-3 transition-all duration-200 ${placementClass} ${className}`}
    >
      {/* ── Screen-Reader ONLY Polite Announcement Area ────────────────── */}
      {/* Announces ONLY finalized sentences to prevent assistive tech spam */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestFinalUtterance && (
          <span>
            {latestFinalUtterance.speakerDisplayName} said: {latestFinalUtterance.text}
          </span>
        )}
      </div>

      {/* ── Lightweight Subtitle Pill (Google Meet / Zoom Style) ────────── */}
      <div className="mx-auto rounded-xl sm:rounded-2xl border border-cream/15 bg-noir/85 px-3.5 py-2 text-cream shadow-2xl backdrop-blur-md pointer-events-auto">
        <div className="space-y-1">
          {visibleSubtitles.map((item, idx) => {
            const isLocal = item.speakerPeerId === isLocalSpeakerId;
            const isLatest = idx === visibleSubtitles.length - 1;

            return (
              <div
                key={item.utteranceId}
                className={`flex items-baseline gap-1.5 sm:gap-2 text-xs sm:text-[13px] leading-snug transition-opacity ${
                  isLatest ? "opacity-100" : "opacity-75"
                }`}
              >
                {/* Modality Tag */}
                {item.source === "sign" && (
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 font-mono px-1 py-0.2 rounded shrink-0">
                    {item.metadata?.isGesture ? "Gesture" : "Sign"}
                  </span>
                )}
                {item.source === "typed" && (
                  <span className="text-[10px] bg-blue-400/20 text-blue-300 font-mono px-1 py-0.2 rounded shrink-0">
                    Type
                  </span>
                )}

                {/* Speaker Identity */}
                <span className="font-bold text-cream/90 shrink-0">
                  {item.speakerDisplayName}
                  {isLocal ? " (You)" : ""}:
                </span>

                {/* Subtitle Text (Final vs Interim) */}
                <span
                  className={`break-words ${
                    item.isFinal ? "font-medium text-cream" : "italic text-cream/85 font-normal"
                  }`}
                >
                  {item.text}
                  {!item.isFinal && (
                    <span
                      className="inline-block ml-1.5 h-1.5 w-1.5 rounded-full bg-crimson animate-pulse align-middle"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
