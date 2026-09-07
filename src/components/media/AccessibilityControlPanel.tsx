import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Volume2,
  VolumeX,
  Keyboard,
  Hand,
  Video,
  MessageSquare,
  Sliders,
  X,
  ArrowRight,
  Shield,
  Check,
} from "lucide-react";
import { useTTS } from "@/hooks/use-tts";
import { useSignRecognitionContext } from "@/hooks/use-sign-recognition-context";
import { useAccessibility } from "@/hooks/use-accessibility";

interface AccessibilityControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTypeToSpeak: () => void;
  isCaptionsEnabled: boolean;
  onToggleCaptions: () => void;
  isGestureSafe: boolean;
  onToggleGestureSafe: () => void;
  className?: string;
}

export function AccessibilityControlPanel({
  isOpen,
  onClose,
  onOpenTypeToSpeak,
  isCaptionsEnabled,
  onToggleCaptions,
  isGestureSafe,
  onToggleGestureSafe,
  className = "",
}: AccessibilityControlPanelProps) {
  const {
    config: ttsConfig,
    updateConfig: updateTTSConfig,
    toggleTTS,
    voices,
    enableWithGesture,
  } = useTTS();
  const { config: signConfig, toggleSignRecognition } = useSignRecognitionContext();
  const { profileInfo, preferences, updatePreferences } = useAccessibility();

  const [captionSize, setCaptionSize] = useState<"standard" | "large">(
    preferences.largeControls ? "large" : "standard",
  );
  const [highContrast, setHighContrast] = useState<boolean>(preferences.highContrast);

  if (!isOpen) return null;

  const handleToggleTTS = async () => {
    if (!ttsConfig.enabled) {
      await enableWithGesture();
      updatePreferences({ speechOutputEnabled: true });
    } else {
      toggleTTS();
      updatePreferences({ speechOutputEnabled: false });
    }
  };

  const handleToggleSign = () => {
    toggleSignRecognition();
    updatePreferences({ signRecognitionEnabled: !signConfig.enabled });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accessibility & Multimodal Controls"
      className={`absolute bottom-20 right-4 z-40 w-full max-w-sm rounded-3xl border border-noir/15 bg-card/95 p-5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-noir/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-crimson/10 text-crimson">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-noir">Accessibility Controls</h3>
            <p className="text-[10px] text-noir/50">
              Mode: {profileInfo?.label || "Standard"} • Tailored Defaults
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-noir/40 hover:bg-noir/5 hover:text-noir transition"
          aria-label="Close accessibility panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Control Rows */}
      <div className="mt-4 space-y-4 max-h-[65vh] overflow-y-auto pr-1 no-scrollbar text-xs">
        {/* 1. Speech Output (TTS) */}
        <div className="rounded-2xl border border-noir/10 bg-background/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-wine" />
              <span className="font-bold text-noir">Speech Output (TTS)</span>
            </div>
            <button
              onClick={handleToggleTTS}
              className={`rounded-full px-3 py-1 text-xs font-bold transition shadow-sm ${
                ttsConfig.enabled
                  ? "bg-wine text-cream"
                  : "bg-noir/10 text-noir/70 hover:bg-noir/20 hover:text-noir"
              }`}
            >
              {ttsConfig.enabled ? "ON" : "OFF"}
            </button>
          </div>

          {ttsConfig.enabled && (
            <div className="pt-2 border-t border-noir/10 space-y-2">
              {/* Voice select */}
              {voices.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-noir/60">Voice</span>
                  <select
                    value={ttsConfig.voiceId || ""}
                    onChange={(e) => updateTTSConfig({ voiceId: e.target.value })}
                    className="max-w-[160px] truncate rounded-lg border border-noir/15 bg-card px-2 py-1 text-[11px] text-noir focus:outline-none"
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Speed select */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-noir/60">Speed ({ttsConfig.rate}×)</span>
                <div className="flex items-center gap-1">
                  {[0.75, 1.0, 1.25, 1.5].map((r) => (
                    <button
                      key={r}
                      onClick={() => updateTTSConfig({ rate: r })}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
                        ttsConfig.rate === r
                          ? "bg-wine text-cream"
                          : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                      }`}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Type to Speak */}
        <div className="rounded-2xl border border-noir/10 bg-background/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-crimson" />
            <div>
              <span className="font-bold text-noir block">Type to Speak</span>
              <span className="text-[10px] text-noir/50">Quick speech presets & keyboard bar</span>
            </div>
          </div>
          <button
            onClick={() => {
              onOpenTypeToSpeak();
              onClose();
            }}
            className="rounded-full bg-crimson px-3 py-1 text-xs font-bold text-cream hover:bg-wine transition shadow-sm"
          >
            Open
          </button>
        </div>

        {/* 3. Sign Recognition */}
        <div className="rounded-2xl border border-noir/10 bg-background/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hand className="h-4 w-4 text-amber-600" />
            <div>
              <span className="font-bold text-noir block">Sign Recognition</span>
              <span className="text-[10px] text-noir/50">ASL Handshape tracking</span>
            </div>
          </div>
          <button
            onClick={handleToggleSign}
            className={`rounded-full px-3 py-1 text-xs font-bold transition shadow-sm ${
              signConfig.enabled
                ? "bg-amber-600 text-cream"
                : "bg-noir/10 text-noir/70 hover:bg-noir/20"
            }`}
          >
            {signConfig.enabled ? "ON" : "OFF"}
          </button>
        </div>

        {/* 4. Gesture-Safe Framing */}
        <div className="rounded-2xl border border-noir/10 bg-background/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-700" />
            <div>
              <span className="font-bold text-noir block">Gesture-Safe Framing</span>
              <span className="text-[10px] text-noir/50">Full view without crop</span>
            </div>
          </div>
          <button
            onClick={onToggleGestureSafe}
            className={`rounded-full px-3 py-1 text-xs font-bold transition shadow-sm ${
              isGestureSafe
                ? "bg-emerald-700 text-cream"
                : "bg-noir/10 text-noir/70 hover:bg-noir/20"
            }`}
          >
            {isGestureSafe ? "ON" : "OFF"}
          </button>
        </div>

        {/* 5. Captions & Contrast Presentation */}
        <div className="rounded-2xl border border-noir/10 bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-noir" />
              <span className="font-bold text-noir">Captions & Visuals</span>
            </div>
            <button
              onClick={onToggleCaptions}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                isCaptionsEnabled ? "bg-noir text-cream" : "bg-noir/10 text-noir/60"
              }`}
            >
              {isCaptionsEnabled ? "Visible" : "Hidden"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => {
                const next = captionSize === "large" ? "standard" : "large";
                setCaptionSize(next);
                updatePreferences({ largeControls: next === "large" });
              }}
              className={`rounded-xl border p-2 text-center transition ${
                captionSize === "large"
                  ? "border-crimson bg-crimson/5 text-crimson font-bold"
                  : "border-noir/10 bg-background text-noir/70"
              }`}
            >
              <span className="block text-[10px] text-noir/50">Text Size</span>
              <span>{captionSize === "large" ? "Large" : "Standard"}</span>
            </button>

            <button
              onClick={() => {
                const next = !highContrast;
                setHighContrast(next);
                updatePreferences({ highContrast: next });
              }}
              className={`rounded-xl border p-2 text-center transition ${
                highContrast
                  ? "border-crimson bg-crimson/5 text-crimson font-bold"
                  : "border-noir/10 bg-background text-noir/70"
              }`}
            >
              <span className="block text-[10px] text-noir/50">Contrast</span>
              <span>{highContrast ? "High" : "Standard"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Link to Settings */}
      <div className="mt-4 pt-3 border-t border-noir/10 flex items-center justify-between text-xs">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 font-semibold text-crimson hover:underline"
        >
          <span>More settings</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <span className="text-[10px] text-noir/40">Voxonix 1-to-1</span>
      </div>
    </div>
  );
}
