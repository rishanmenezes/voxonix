import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-helpers";
import { useAuth } from "@/hooks/use-auth";

import { useTTS } from "@/hooks/use-tts";
import { useSignRecognitionContext } from "@/hooks/use-sign-recognition-context";
import { useAccessibility } from "@/hooks/use-accessibility";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import {
  ArrowLeft,
  Video,
  Mic,
  Accessibility,
  Volume2,
  Hand,
  MessageSquare,
  Sliders,
  Shield,
  LogOut,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Settings — VOXONIX" },
      {
        name: "description",
        content: "Manage your Voxonix multimodal preferences, speech voices, and controls.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { signOut } = useAuth();
  const { config: ttsConfig, updateConfig: updateTTSConfig, voices } = useTTS();
  const { config: signConfig, updateConfig: updateSignConfig } = useSignRecognitionContext();
  const { profileInfo, preferences, updatePreferences } = useAccessibility();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-noir/10 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-[22px] italic text-wine">Voxonix</span>
            <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">
              ✕ AI
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              to="/dashboard"
              className="rounded-full px-4 py-2 text-sm text-noir/70 transition hover:bg-noir/5 hover:text-noir"
            >
              Dashboard
            </Link>
            <Link
              to="/profile"
              className="rounded-full px-4 py-2 text-sm text-noir/70 transition hover:bg-noir/5 hover:text-noir"
            >
              Profile
            </Link>
            <Link
              to="/settings"
              className="rounded-full px-4 py-2 text-sm font-medium text-crimson transition hover:bg-crimson/10"
            >
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-noir/20 px-4 py-2 text-sm text-noir/70 transition hover:border-noir/40 hover:text-noir"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-noir/60 transition hover:text-noir"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <h1 className="mt-6 font-display text-4xl text-noir">Settings</h1>
        <p className="mt-1 text-sm text-noir/65">
          Configure speech output voices, gesture recognition sensitivity, and accessibility
          controls.
        </p>

        <div className="mt-8 space-y-6">
          {/* 1. Speech Output & TTS Settings */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-wine" />
                <h2 className="font-display text-xl font-bold text-noir">Speech Output (TTS)</h2>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  ttsConfig.enabled ? "bg-wine text-cream" : "bg-noir/10 text-noir/60"
                }`}
              >
                {ttsConfig.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Voice Select */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                <div>
                  <p className="font-bold text-noir">Synthesis Voice</p>
                  <p className="text-[10px] text-noir/50">
                    Select preferred voice for reading captions aloud
                  </p>
                </div>
                <select
                  value={ttsConfig.voiceId || ""}
                  onChange={(e) => updateTTSConfig({ voiceId: e.target.value })}
                  className="rounded-xl border border-noir/15 bg-background px-3 py-2 text-xs text-noir max-w-xs focus:outline-none"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              {/* Speech Rate Slider */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                <div>
                  <p className="font-bold text-noir">Speaking Rate ({ttsConfig.rate}×)</p>
                  <p className="text-[10px] text-noir/50">
                    Adjust playback speed for synthesized speech
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0.75, 1.0, 1.25, 1.5, 1.75].map((r) => (
                    <button
                      key={r}
                      onClick={() => updateTTSConfig({ rate: r })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
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

              {/* Acoustic Ducking Switch */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="font-bold text-noir">Microphone Ducking</p>
                  <p className="text-[10px] text-noir/50">
                    Prevents acoustic echo loops by temporarily attenuating mic while TTS speaks
                  </p>
                </div>
                <button
                  onClick={() =>
                    updateTTSConfig({ duckMicDuringSpeech: !ttsConfig.duckMicDuringSpeech })
                  }
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    ttsConfig.duckMicDuringSpeech
                      ? "bg-emerald-700 text-cream"
                      : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {ttsConfig.duckMicDuringSpeech ? "Active" : "Disabled"}
                </button>
              </div>
            </div>
          </div>

          {/* 2. Sign Recognition Settings */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand className="h-5 w-5 text-amber-600" />
                <h2 className="font-display text-xl font-bold text-noir">Sign Recognition</h2>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  signConfig.enabled ? "bg-amber-600 text-cream" : "bg-noir/10 text-noir/60"
                }`}
              >
                {signConfig.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                <div>
                  <p className="font-bold text-noir">
                    Stability Hold Threshold ({signConfig.stabilityThresholdMs} ms)
                  </p>
                  <p className="text-[10px] text-noir/50">
                    Duration required to hold a sign before finalizing
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {[250, 350, 500].map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSignConfig({ stabilityThresholdMs: t })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        signConfig.stabilityThresholdMs === t
                          ? "bg-amber-600 text-cream"
                          : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                      }`}
                    >
                      {t}ms
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="font-bold text-noir">On-Screen Sign HUD</p>
                  <p className="text-[10px] text-noir/50">
                    Display landmark observation HUD and recognized letter buffer
                  </p>
                </div>
                <button
                  onClick={() => updateSignConfig({ showHUD: !signConfig.showHUD })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    signConfig.showHUD ? "bg-amber-600 text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {signConfig.showHUD ? "Visible" : "Hidden"}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Visual & Caption Settings */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-crimson" />
              <h2 className="font-display text-xl font-bold text-noir">
                Captions & Visual Accessibility
              </h2>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-noir/10 pb-3">
                <div>
                  <p className="font-bold text-noir">High Contrast Mode</p>
                  <p className="text-[10px] text-noir/50">
                    Boost contrast across UI controls and subtitle bubbles
                  </p>
                </div>
                <button
                  onClick={() => updatePreferences({ highContrast: !preferences.highContrast })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.highContrast ? "bg-crimson text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.highContrast ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center justify-between border-b border-noir/10 pb-3">
                <div>
                  <p className="font-bold text-noir">Large Controls & Typography</p>
                  <p className="text-[10px] text-noir/50">
                    Enlarge touch targets and text sizes for easier interaction
                  </p>
                </div>
                <button
                  onClick={() => updatePreferences({ largeControls: !preferences.largeControls })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.largeControls ? "bg-crimson text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.largeControls ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="font-bold text-noir">Reduced Motion</p>
                  <p className="text-[10px] text-noir/50">Minimize UI animations and transitions</p>
                </div>
                <button
                  onClick={() => updatePreferences({ reducedMotion: !preferences.reducedMotion })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.reducedMotion ? "bg-crimson text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.reducedMotion ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          {/* Privacy & E2E Security */}
          <div className="rounded-3xl border border-noir/10 bg-background/40 p-6 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noir/5">
              <Shield className="h-5 w-5 text-noir/70" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-noir">End-to-End Encrypted & Privacy-First</p>
              <p className="text-noir/60 mt-0.5">
                All WebRTC video, audio, sign landmarks, and caption streams are peer-to-peer and
                encrypted. No raw media is stored on external servers.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
