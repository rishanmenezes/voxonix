import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useBlindVoiceAssistant } from "@/hooks/use-blind-voice-assistant";
import { AlertCircle, Check, Mic, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";

export function BlindVoiceWakeBanner() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const {
    isVoiceGuideActive,
    isListening,
    isSpeaking,
    voiceGuidanceEnabled,
    voiceState,
    hasAudioStream,
    activeTrackCount,
    lastSpokenText,
    lastTranscript,
    assistantError,
    ttsError,
    pendingConfirmation,
    disableVoiceGuidance,
    pauseListening,
    resumeListening,
    repeatLastSpoken,
    cancelSpeech,
    confirmPendingAction,
    cancelPendingAction,
  } = useBlindVoiceAssistant();

  const isIneligible = !isAuthenticated || user?.user_metadata?.accessibility_profile !== "blind";

  const isBlindRegisterActive =
    !isAuthenticated && location.pathname === "/register" && isVoiceGuideActive;

  const isBlindLoginActive =
    !isAuthenticated && location.pathname === "/login" && isVoiceGuideActive;

  if (isIneligible && !isBlindRegisterActive && !isBlindLoginActive) {
    return null;
  }

  const hasError = Boolean(
    assistantError ||
    ttsError ||
    voiceState === "permission_denied" ||
    voiceState === "device_unavailable" ||
    voiceState === "error",
  );

  // When inactive or not actively in Blind registration/authenticated Blind mode, keep DOM free of assistant status bars
  if (!isVoiceGuideActive && (!isAuthenticated || !voiceGuidanceEnabled) && !hasError) {
    return null;
  }

  return (
    <aside
      aria-label="VOXONIX Voice Assistant"
      data-voice-state={voiceState}
      data-tts-state={ttsError ? "error" : isSpeaking ? "speaking" : "idle"}
      className={`relative z-40 border-b px-4 py-2 text-xs font-medium transition-colors ${
        hasError
          ? "border-crimson/35 bg-crimson/10 text-noir"
          : "border-amber-400 bg-amber-500/15 text-amber-950"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {hasError ? (
            <AlertCircle className="h-4 w-4 text-crimson shrink-0" aria-hidden="true" />
          ) : isSpeaking ? (
            <Volume2 className="h-4 w-4 animate-pulse text-amber-700 shrink-0" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
          )}

          <span className="font-bold">VOXONIX Voice Assistant (Gnani)</span>

          <span className="rounded-full bg-white/80 border border-noir/10 px-2.5 py-0.5 text-[10px] font-bold text-noir">
            {isSpeaking
              ? "Speaking (Timbre v3.0)"
              : voiceState === "processing"
                ? "Recognizing (Prisma v3.0)…"
                : hasAudioStream && isListening && activeTrackCount > 0
                  ? "Microphone listening (Prisma v3.0)"
                  : `State: ${voiceState}`}
          </span>

          {lastTranscript && (
            <span data-testid="voice-last-transcript" className="text-[11px] text-noir/75 italic">
              Heard: &quot;{lastTranscript.slice(-48)}&quot;
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {pendingConfirmation && (
            <>
              <button
                type="button"
                id="btn-voice-confirm"
                onClick={confirmPendingAction}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold hover:bg-emerald-800 transition"
              >
                <Check className="h-3 w-3" />
                <span>Confirm</span>
              </button>
              <button
                type="button"
                id="btn-voice-cancel"
                onClick={cancelPendingAction}
                className="inline-flex items-center gap-1 rounded-full border border-noir/25 bg-white px-2.5 py-1 text-xs font-semibold text-noir hover:bg-noir/5 transition"
              >
                <X className="h-3 w-3" />
                <span>Cancel</span>
              </button>
            </>
          )}

          {lastSpokenText && (
            <button
              type="button"
              id="btn-voice-repeat"
              onClick={repeatLastSpoken}
              className="inline-flex items-center gap-1 rounded-full border border-amber-800/25 bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-noir hover:bg-white transition"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Repeat</span>
            </button>
          )}

          {isSpeaking && (
            <button
              type="button"
              id="btn-voice-stop-speaking"
              onClick={cancelSpeech}
              className="inline-flex items-center gap-1 rounded-full bg-crimson text-white px-2.5 py-0.5 text-xs font-semibold hover:bg-wine transition"
            >
              <VolumeX className="h-3 w-3" />
              <span>Stop speaking</span>
            </button>
          )}

          {isListening ? (
            <button
              type="button"
              id="btn-voice-pause-mic"
              onClick={() => pauseListening(false)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-800/30 bg-white/80 text-amber-950 px-2.5 py-0.5 text-xs font-semibold hover:bg-white transition"
            >
              <Pause className="h-3 w-3" />
              <span>Pause mic</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-voice-resume-mic"
              onClick={() => void resumeListening()}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-700 text-white px-2.5 py-0.5 text-xs font-semibold hover:bg-emerald-800 transition"
            >
              <Play className="h-3 w-3" />
              <span>Resume mic</span>
            </button>
          )}

          <button
            type="button"
            id="btn-voice-turn-off"
            onClick={() => disableVoiceGuidance()}
            className="inline-flex items-center gap-1 rounded-full bg-amber-800 text-white px-2.5 py-0.5 text-xs font-semibold hover:bg-amber-900 transition"
            aria-label="Turn Voice Guidance Off (Alt+B)"
          >
            <VolumeX className="h-3 w-3" />
            <span>Turn Off</span>
          </button>
        </div>
      </div>

      {/* Text fallback & clear accessible error reporting (always displays assistant text even if Gnani Timbre TTS fails) */}
      {(ttsError || assistantError || lastSpokenText) && (
        <div
          role={ttsError || assistantError ? "alert" : "status"}
          aria-live="polite"
          data-testid="voice-assistant-text-response"
          className="mx-auto mt-1.5 max-w-7xl flex flex-wrap items-center gap-2 text-[11px]"
        >
          {ttsError && (
            <span className="font-bold text-crimson" data-testid="voice-tts-error">
              {ttsError}
            </span>
          )}
          {assistantError && (
            <span className="font-bold text-crimson" data-testid="voice-stt-error">
              {assistantError}
            </span>
          )}
          {lastSpokenText && (
            <span className="text-noir/85" data-testid="voice-response-text">
              Assistant: {lastSpokenText}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}
