import { Volume2, VolumeX, Sliders, X, Headphones, Speaker, ShieldCheck } from "lucide-react";
import { useTTS } from "@/context/tts-context";

interface TTSSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function TTSSettingsPopover({ isOpen, onClose, className = "" }: TTSSettingsPopoverProps) {
  const { config, voices, isSupported, updateConfig, toggleTTS } = useTTS();

  if (!isOpen) return null;

  return (
    <div
      className={`absolute bottom-20 left-4 z-40 w-84 rounded-2xl border border-noir/15 bg-card/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 ${className}`}
      role="dialog"
      aria-label="Text-to-Speech Settings"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-noir/10 pb-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-noir">
          <Sliders className="h-4 w-4 text-wine" />
          <span>Speech Output (TTS) Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-noir/50 hover:bg-noir/10 hover:text-noir"
          aria-label="Close TTS settings"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!isSupported ? (
        <div className="py-4 text-center text-xs text-crimson font-medium">
          Speech synthesis is not supported in this browser.
        </div>
      ) : (
        <div className="space-y-3 pt-3 text-xs text-noir">
          {/* Main TTS Enable Toggle */}
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              {config.enabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-noir/40" />
              )}
              <span>Enable Speech Output</span>
            </span>
            <button
              type="button"
              onClick={toggleTTS}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.enabled ? "bg-crimson" : "bg-noir/20"
              }`}
              role="switch"
              aria-checked={config.enabled}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.enabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Audio Output Mode (Headphones vs Speakers) */}
          <div className="space-y-1.5 rounded-xl border border-noir/10 bg-background/60 p-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-noir/80">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-600" /> Output Acoustic Mode
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updateConfig({ audioDeviceMode: "speakers", duckMicDuringSpeech: true })
                }
                className={`flex items-center justify-center gap-1 rounded-lg py-1 px-2 text-[11px] font-medium transition ${
                  config.audioDeviceMode === "speakers"
                    ? "bg-wine text-cream shadow-sm"
                    : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                }`}
              >
                <Speaker className="h-3 w-3" />
                <span>Speakers (AEC)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  updateConfig({ audioDeviceMode: "headphones", duckMicDuringSpeech: false })
                }
                className={`flex items-center justify-center gap-1 rounded-lg py-1 px-2 text-[11px] font-medium transition ${
                  config.audioDeviceMode === "headphones"
                    ? "bg-wine text-cream shadow-sm"
                    : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                }`}
              >
                <Headphones className="h-3 w-3" />
                <span>Headphones</span>
              </button>
            </div>
            <p className="text-[10px] text-noir/50 leading-tight">
              {config.audioDeviceMode === "speakers"
                ? "Speaker mode actively ducks microphone during speech to prevent acoustic loops."
                : "Headphones mode allows full duplex without aggressive mic ducking."}
            </p>
          </div>

          {/* Auto-Speak Incoming Captions Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-noir/80">Auto-speak incoming captions</span>
            <input
              type="checkbox"
              checked={config.autoSpeakCaptions}
              onChange={(e) => updateConfig({ autoSpeakCaptions: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-noir/20 text-crimson focus:ring-crimson accent-crimson"
            />
          </div>

          {/* Interrupt Backlog on Typed Speech */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-noir/80">Interrupt caption backlog when typing</span>
            <input
              type="checkbox"
              checked={config.interruptBacklogOnTyped}
              onChange={(e) => updateConfig({ interruptBacklogOnTyped: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-noir/20 text-crimson focus:ring-crimson accent-crimson"
            />
          </div>

          {/* Voice Selection */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-noir/70">Voice</label>
            <select
              value={config.voiceId || ""}
              onChange={(e) => updateConfig({ voiceId: e.target.value })}
              className="w-full rounded-xl border border-noir/15 bg-background px-2.5 py-1.5 text-xs text-noir focus:border-crimson focus:outline-none"
            >
              <option value="">Default System Voice</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Speech Rate (Speed) Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-noir/70">Speed / Rate</span>
              <span className="font-mono text-[10px] text-wine font-bold">
                {config.rate.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={config.rate}
              onChange={(e) => updateConfig({ rate: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-noir/15 rounded-lg appearance-none cursor-pointer accent-crimson"
            />
          </div>

          {/* Speech Pitch Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-noir/70">Pitch</span>
              <span className="font-mono text-[10px] text-wine font-bold">
                {config.pitch.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={config.pitch}
              onChange={(e) => updateConfig({ pitch: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-noir/15 rounded-lg appearance-none cursor-pointer accent-crimson"
            />
          </div>

          {/* Volume Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-noir/70">Volume</span>
              <span className="font-mono text-[10px] text-wine font-bold">
                {Math.round(config.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.volume}
              onChange={(e) => updateConfig({ volume: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-noir/15 rounded-lg appearance-none cursor-pointer accent-crimson"
            />
          </div>
        </div>
      )}
    </div>
  );
}
