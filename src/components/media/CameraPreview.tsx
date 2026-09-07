import { Camera, CameraOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCamera } from "@/hooks/use-camera";

export function CameraPreview() {
  const {
    state,
    error,
    deviceInfo,
    videoRef,
    startCamera,
    stopCamera,
    restartCamera,
    retryCamera,
  } = useCamera();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Video Container */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-noir/15 bg-noir text-cream shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          data-mirror="true"
          className={`h-full w-full object-cover video-mirrored transition-opacity duration-300 ${
            state === "live" ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        {/* Fallback overlay when not live */}
        {state !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {state === "requesting" && (
              <div className="animate-pulse space-y-3">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-crimson/20 text-crimson">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
                <p className="font-display text-xl text-cream">Requesting camera permission...</p>
                <p className="text-xs text-cream/60">Please allow camera access in your browser.</p>
              </div>
            )}

            {state === "error" && (
              <div className="max-w-md space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-crimson/20 text-crimson">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <p className="font-display text-xl text-cream">Camera Unavailable</p>
                <p className="text-sm text-cream/70">{error}</p>
                <button
                  onClick={retryCamera}
                  className="inline-flex items-center gap-2 rounded-full bg-crimson px-5 py-2.5 text-sm font-medium text-cream transition hover:bg-wine"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Permission
                </button>
              </div>
            )}

            {(state === "idle" || state === "stopped") && (
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cream/10 text-cream/60">
                  <CameraOff className="h-8 w-8" />
                </div>
                <p className="font-display text-xl text-cream">
                  {state === "idle" ? "Ready to start camera" : "Camera is turned off"}
                </p>
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream transition hover:bg-wine"
                >
                  <Camera className="h-4 w-4" />
                  Turn Camera On
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live Overlay Badge */}
        {state === "live" && (
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-noir/70 px-3 py-1.5 backdrop-blur-md">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-cream">LIVE</span>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {(state === "idle" || state === "stopped") && (
          <button
            onClick={startCamera}
            className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream transition hover:bg-wine shadow-md"
          >
            <Camera className="h-4 w-4" />
            Turn Camera On
          </button>
        )}

        {state === "live" && (
          <>
            <button
              onClick={stopCamera}
              className="inline-flex items-center gap-2 rounded-full bg-noir px-6 py-3 text-sm font-medium text-cream transition hover:bg-noir/80 shadow-md"
            >
              <CameraOff className="h-4 w-4" />
              Turn Camera Off
            </button>
            <button
              onClick={restartCamera}
              className="inline-flex items-center gap-2 rounded-full border border-noir/20 bg-card px-6 py-3 text-sm font-medium text-noir transition hover:bg-noir/5 shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Restart Camera
            </button>
          </>
        )}

        {state === "error" && (
          <button
            onClick={retryCamera}
            className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream transition hover:bg-wine shadow-md"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Camera
          </button>
        )}
      </div>

      {/* Camera Status & Diagnostic Panel */}
      <div className="rounded-2xl border border-noir/15 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-noir/10 pb-3">
          <h3 className="font-display text-lg font-medium text-noir">
            Camera Status & Diagnostics
          </h3>
          <StatusBadge state={state} />
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
              Resolution
            </span>
            <span className="mt-1 block font-semibold text-noir">
              {deviceInfo.width && deviceInfo.height
                ? `${deviceInfo.width} × ${deviceInfo.height}`
                : "N/A"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  switch (state) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Live
        </span>
      );
    case "requesting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-500/20">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Requesting...
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson border border-crimson/20">
          <AlertTriangle className="h-3.5 w-3.5" />
          Unavailable
        </span>
      );
    case "stopped":
    case "idle":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-noir/5 px-3 py-1 text-xs font-medium text-noir/60 border border-noir/10">
          <CameraOff className="h-3.5 w-3.5" />
          Off
        </span>
      );
  }
}
