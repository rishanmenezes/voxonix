import {
  Mic,
  MicOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMicrophone } from "@/hooks/use-microphone";

export function MicrophonePreview() {
  const {
    state,
    isMuted,
    inputLevel,
    error,
    deviceInfo,
    startMicrophone,
    stopMicrophone,
    restartMicrophone,
    toggleMute,
    retryMicrophone,
  } = useMicrophone();

  const levelPercent = Math.round(inputLevel * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Audio Visualizer & Level Meter Box */}
      <div className="relative overflow-hidden rounded-2xl border border-noir/15 bg-noir p-8 text-cream shadow-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                  state === "live"
                    ? isMuted
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400"
                    : "bg-cream/10 text-cream/40"
                }`}
              >
                {state === "live" ? (
                  isMuted ? (
                    <VolumeX className="h-6 w-6" />
                  ) : (
                    <Volume2 className="h-6 w-6 animate-pulse" />
                  )
                ) : (
                  <MicOff className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-display text-xl text-cream">Microphone Input Signal</h3>
                <p className="text-xs text-cream/60">
                  {state === "live"
                    ? isMuted
                      ? "Microphone is muted (audio track disabled)"
                      : "Web Audio API real-time signal analysis"
                    : "Start microphone to activate signal detection"}
                </p>
              </div>
            </div>

            {state === "live" && (
              <div className="flex items-center gap-2 rounded-full bg-noir/80 px-3 py-1.5 border border-cream/10">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isMuted ? "bg-amber-500" : "h-2.5 w-2.5 animate-pulse bg-emerald-500"
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-cream">
                  {isMuted ? "MUTED" : "LIVE"}
                </span>
              </div>
            )}
          </div>

          {/* Level Meter Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-cream/70">
              <span>Input Level</span>
              <span className="font-mono text-sm font-semibold text-cream">{levelPercent}%</span>
            </div>

            <div className="relative h-5 w-full overflow-hidden rounded-full bg-cream/10 p-0.5 border border-cream/10">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  isMuted
                    ? "bg-amber-500/40"
                    : levelPercent > 75
                      ? "bg-gradient-to-r from-emerald-500 via-amber-500 to-crimson"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${state === "live" && !isMuted ? levelPercent : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Fallback Overlay when not live */}
        {state !== "live" && (
          <div className="mt-6 border-t border-cream/10 pt-6 text-center">
            {state === "requesting" && (
              <div className="animate-pulse space-y-2">
                <p className="font-display text-lg text-cream">
                  Requesting microphone permission...
                </p>
                <p className="text-xs text-cream/60">
                  Please allow microphone access in your browser.
                </p>
              </div>
            )}

            {state === "error" && (
              <div className="max-w-md mx-auto space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-crimson/20 text-crimson">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <p className="font-display text-lg text-cream">Microphone Unavailable</p>
                <p className="text-sm text-cream/70">{error}</p>
                <button
                  onClick={retryMicrophone}
                  className="inline-flex items-center gap-2 rounded-full bg-crimson px-5 py-2 text-sm font-medium text-cream hover:bg-wine transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Permission
                </button>
              </div>
            )}

            {(state === "idle" || state === "stopped") && (
              <div className="space-y-3">
                <p className="font-display text-lg text-cream">
                  {state === "idle" ? "Ready to start microphone" : "Microphone is turned off"}
                </p>
                <button
                  onClick={startMicrophone}
                  className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-2.5 text-sm font-medium text-cream hover:bg-wine transition"
                >
                  <Mic className="h-4 w-4" />
                  Turn Microphone On
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {(state === "idle" || state === "stopped") && (
          <button
            onClick={startMicrophone}
            className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine"
          >
            <Mic className="h-4 w-4" />
            Turn Microphone On
          </button>
        )}

        {state === "live" && (
          <>
            <button
              onClick={toggleMute}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-cream shadow-md transition ${
                isMuted ? "bg-amber-600 hover:bg-amber-700" : "bg-noir hover:bg-noir/80"
              }`}
            >
              {isMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {isMuted ? "Unmute Microphone" : "Mute Microphone"}
            </button>

            <button
              onClick={stopMicrophone}
              className="inline-flex items-center gap-2 rounded-full bg-noir px-6 py-3 text-sm font-medium text-cream shadow-md transition hover:bg-noir/80"
            >
              <MicOff className="h-4 w-4" />
              Turn Microphone Off
            </button>

            <button
              onClick={restartMicrophone}
              className="inline-flex items-center gap-2 rounded-full border border-noir/20 bg-card px-6 py-3 text-sm font-medium text-noir shadow-sm transition hover:bg-noir/5"
            >
              <RefreshCw className="h-4 w-4" />
              Restart Microphone
            </button>
          </>
        )}

        {state === "error" && (
          <button
            onClick={retryMicrophone}
            className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Microphone
          </button>
        )}
      </div>

      {/* Status & Diagnostic Panel */}
      <div className="rounded-2xl border border-noir/15 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-noir/10 pb-3">
          <h3 className="font-display text-lg font-medium text-noir">
            Microphone Status & Diagnostics
          </h3>
          <StatusBadge state={state} isMuted={isMuted} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-noir/10 bg-background/50 p-3">
            <span className="block font-medium uppercase tracking-wider text-noir/50">Status</span>
            <span className="mt-1 block font-semibold text-noir capitalize">{state}</span>
          </div>

          <div className="rounded-xl border border-noir/10 bg-background/50 p-3">
            <span className="block font-medium uppercase tracking-wider text-noir/50">Device</span>
            <span className="mt-1 block truncate font-semibold text-noir" title={deviceInfo.label}>
              {deviceInfo.label}
            </span>
          </div>

          <div className="rounded-xl border border-noir/10 bg-background/50 p-3">
            <span className="block font-medium uppercase tracking-wider text-noir/50">
              Track State
            </span>
            <span className="mt-1 block font-semibold text-noir capitalize">
              {deviceInfo.readyState}
            </span>
          </div>

          <div className="rounded-xl border border-noir/10 bg-background/50 p-3">
            <span className="block font-medium uppercase tracking-wider text-noir/50">
              Track Enabled
            </span>
            <span
              className={`mt-1 block font-semibold ${
                deviceInfo.enabled ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {deviceInfo.enabled ? "Yes (Active)" : "No (Muted)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ state, isMuted }: { state: string; isMuted: boolean }) {
  switch (state) {
    case "live":
      return isMuted ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
          <VolumeX className="h-3.5 w-3.5" />
          Muted
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Live
        </span>
      );
    case "requesting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Requesting...
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-crimson/20 bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson">
          <AlertTriangle className="h-3.5 w-3.5" />
          Unavailable
        </span>
      );
    case "stopped":
    case "idle":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-noir/10 bg-noir/5 px-3 py-1 text-xs font-medium text-noir/60">
          <MicOff className="h-3.5 w-3.5" />
          Off
        </span>
      );
  }
}
