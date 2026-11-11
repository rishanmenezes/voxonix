import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-helpers";
import { useAuth } from "@/hooks/use-auth";

import { useTTS } from "@/hooks/use-tts";
import { useSignRecognitionContext } from "@/hooks/use-sign-recognition-context";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useBlindVoiceAssistant } from "@/hooks/use-blind-voice-assistant";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { hasCapability, normalizePrimaryProfile } from "@/lib/capabilities";
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
  Binary,
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
  const { signOut, signOutAll } = useAuth();
  const { config: ttsConfig, updateConfig: updateTTSConfig, voices } = useTTS();
  const { config: signConfig, updateConfig: updateSignConfig } = useSignRecognitionContext();
  const { profile, profileInfo, preferences, updatePreferences } = useAccessibility();
  const {
    voicePreferences,
    updateVoicePreferences,
    voiceGuidanceEnabled,
    voiceState,
    hasAudioStream,
    isListening,
    enableVoiceGuidance,
    disableVoiceGuidance,
    pauseListening,
    resumeListening,
  } = useBlindVoiceAssistant();
  const navigate = useNavigate();

  const primaryProfile = normalizePrimaryProfile(profile);
  const canUseSignRecognition = hasCapability(primaryProfile, "sign-recognition");
  const canUseTTS =
    hasCapability(primaryProfile, "type-to-speech") ||
    hasCapability(primaryProfile, "spoken-notifications");
  const isBlind = primaryProfile === "blind";
  const isDeaf = primaryProfile === "deaf";
  const isNonSpeaking = primaryProfile === "non-speaking";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const handleSignOutAll = async () => {
    if (signOutAll) {
      await signOutAll();
    } else {
      await signOut();
    }
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
          Configure preferences and assistive controls customized for your communication profile.
        </p>

        <div className="mt-8 space-y-6">
          {/* Active Account Profile Summary */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson/10 text-crimson text-xl font-bold">
                {profileInfo?.emoji || "👤"}
              </div>
              <div>
                <p className="text-xs uppercase font-bold tracking-wider text-noir/50">
                  Active Account Mode
                </p>
                <h3 className="text-lg font-bold text-noir">{profileInfo?.label || "Standard"}</h3>
                <p className="text-xs text-noir/60">{profileInfo?.recommendedFocus}</p>
              </div>
            </div>
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-full border border-noir/20 bg-background/80 px-4 py-2 text-xs font-bold text-noir hover:border-noir/40 transition shrink-0"
            >
              Switch Mode in Profile
            </Link>
          </div>

          {/* 1. Speech Output & TTS Settings (Visible to Non-speaking & Blind profiles) */}
          {canUseTTS && (
            <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-wine" />
                  <h2 className="font-display text-xl font-bold text-noir">
                    {isNonSpeaking
                      ? "Outbound Speech Synthesis (Your Voice)"
                      : "Screen Reader & Spoken Readout"}
                  </h2>
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
                      {isNonSpeaking
                        ? "Select preferred synthetic voice for your AAC phrases and type-to-speak messages"
                        : "Select voice for reading incoming peer captions and room announcements aloud"}
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
          )}

          {/* 2. Sign Recognition Settings (Visible strictly to Deaf profile) */}
          {canUseSignRecognition && (
            <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hand className="h-5 w-5 text-amber-600" />
                  <h2 className="font-display text-xl font-bold text-noir">
                    Sign Recognition & Camera Sensitivity
                  </h2>
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
                      Duration required to hold an Indian Sign Language letter before emitting
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
          )}

          {/* 3. Voice Assistant Settings (Exclusive to Blind profile) */}
          {isBlind && (
            <div className="rounded-3xl border border-amber-300 bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-amber-700" />
                  <h2 className="font-display text-xl font-bold text-noir">
                    Voice Assistant Preferences
                  </h2>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    voiceGuidanceEnabled ? "bg-emerald-700 text-white" : "bg-noir/15 text-noir"
                  }`}
                >
                  {voiceGuidanceEnabled ? "Gnani Voice Active" : "Voice Paused"}
                </span>
              </div>

              <div className="space-y-4 text-xs">
                {/* Consolidated Gnani Prisma & Timbre Voice Assistant Controls */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-noir">Gnani Prisma STT &amp; Timbre TTS</p>
                      <p className="text-[11px] text-noir/65">
                        State: <span className="font-semibold">{voiceState}</span> ·{" "}
                        {hasAudioStream && isListening
                          ? "Microphone listening (Gnani Prisma v3.0 · passwords always protected)"
                          : "Enable voice guidance to navigate and interact hands-free using Gnani speech recognition."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!voiceGuidanceEnabled ? (
                        <button
                          type="button"
                          onClick={() => void enableVoiceGuidance()}
                          className="rounded-full bg-amber-800 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-900 transition"
                        >
                          Enable Voice Guidance
                        </button>
                      ) : (
                        <>
                          {isListening ? (
                            <button
                              type="button"
                              onClick={() => pauseListening(false)}
                              className="rounded-full border border-noir/20 bg-white px-3 py-1.5 text-[11px] font-bold text-noir hover:bg-noir/5 transition"
                            >
                              Pause mic
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void resumeListening()}
                              className="rounded-full bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 transition"
                            >
                              Resume mic
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={disableVoiceGuidance}
                            className="rounded-full border border-crimson/30 bg-crimson/10 px-3 py-1.5 text-[11px] font-bold text-crimson hover:bg-crimson/20 transition"
                          >
                            Disable Voice Guidance
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Assistant Voice Selector (Gnani Timbre v3.0) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                  <div>
                    <p className="font-bold text-noir">
                      Assistant Speech Voice (Gnani Timbre v3.0)
                    </p>
                    <p className="text-[10px] text-noir/50">
                      Choose which Gnani Timbre v3.0 voice reads out responses and navigation
                      prompts
                    </p>
                  </div>
                  <select
                    value={voicePreferences.voiceURI || "Shivani"}
                    onChange={(e) =>
                      updateVoicePreferences({ voiceURI: e.target.value || "Shivani" })
                    }
                    className="rounded-xl border border-noir/15 bg-background px-3 py-2 text-xs text-noir max-w-xs focus:outline-none"
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speech Rate */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                  <div>
                    <p className="font-bold text-noir">Speech Rate ({voicePreferences.rate}×)</p>
                    <p className="text-[10px] text-noir/50">
                      Adjust how fast the assistant speaks to you
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[0.8, 1.0, 1.2, 1.5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => updateVoicePreferences({ rate: r })}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          voicePreferences.rate === r
                            ? "bg-amber-700 text-cream"
                            : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                        }`}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pitch */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-noir/10 pb-3">
                  <div>
                    <p className="font-bold text-noir">Voice Pitch ({voicePreferences.pitch}×)</p>
                    <p className="text-[10px] text-noir/50">Adjust assistant vocal tone pitch</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[0.8, 1.0, 1.2].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateVoicePreferences({ pitch: p })}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          voicePreferences.pitch === p
                            ? "bg-amber-700 text-cream"
                            : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                        }`}
                      >
                        {p}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <div>
                    <p className="font-bold text-noir">
                      Volume ({Math.round(voicePreferences.volume * 100)}%)
                    </p>
                    <p className="text-[10px] text-noir/50">Assistant output volume</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[0.5, 0.75, 1.0].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => updateVoicePreferences({ volume: v })}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          voicePreferences.volume === v
                            ? "bg-amber-700 text-cream"
                            : "bg-noir/5 text-noir/70 hover:bg-noir/10"
                        }`}
                      >
                        {Math.round(v * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Tactile Braille Settings (Visible to Blind profile) */}
          {isBlind && (
            <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Binary className="h-5 w-5 text-crimson" />
                  <h2 className="font-display text-xl font-bold text-noir">
                    Tactile & Braille Feed
                  </h2>
                </div>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Active
                </span>
              </div>
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-noir">Unicode Grade 1 Braille Live Feed</p>
                    <p className="text-[10px] text-noir/50">
                      Translates incoming subtitles and chat into Unicode Braille patterns (⠀–⠿)
                      compatible with refreshable displays
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Always Ready
                  </span>
                </div>
              </div>
            </div>
          )}

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
                WebRTC audio and video use encrypted media transport. Sign landmarks stay in the
                browser; only finalized supported text events are shared. Caption events pass
                through the authenticated signaling service and are not stored by this app today.
              </p>
            </div>
          </div>

          {/* Multi-Device Session Management */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-noir">Active Sessions & Devices</h2>
            <p className="mt-1 text-xs text-noir/60 leading-relaxed">
              VOXONIX supports independent, revocable sessions across your laptop, tablet, and
              assistive hardware displays.
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-noir/10 pt-4">
              <div>
                <p className="text-xs font-bold text-noir">Sign Out Everywhere</p>
                <p className="text-[11px] text-noir/50">
                  Immediately invalidate active sessions and evict active calls across all connected
                  devices.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOutAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-crimson/30 bg-crimson/10 px-4 py-2 text-xs font-semibold text-crimson hover:bg-crimson hover:text-cream transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out of All Devices</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
