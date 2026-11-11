import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { useAuth } from "@/hooks/use-auth";
import { useBlindVoiceAssistant } from "@/hooks/use-blind-voice-assistant";
import {
  ArrowRight,
  ShieldCheck,
  Eye,
  Ear,
  MessageSquare,
  User,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  Lock,
  MicOff,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VOXONIX — Real-Time Universal Inclusive Communication" },
      {
        name: "description",
        content:
          "Assistive communication platform bridging Deaf, Non-speaking, Blind, and Hearing participants through real-time multimodal interaction.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const {
    wakeStatus,
    onboardingState,
    retryWakePermission,
    selectBlindProfileAndStart,
    startBlindVoiceLogin,
    lockOutBlindForSession,
  } = useBlindVoiceAssistant();
  const [dismissedMicNotice, setDismissedMicNotice] = useState(false);

  const showOnboardingChoicePanel =
    !isAuthenticated &&
    (onboardingState === "wake_detected" || onboardingState === "awaiting_auth_intent");

  return (
    <div className="relative min-h-screen overflow-x-hidden text-noir">
      <InteractiveBackground />

      {showOnboardingChoicePanel && (
        <section
          role="region"
          aria-labelledby="blind-onboarding-choice-heading"
          aria-live="polite"
          data-onboarding-state={onboardingState}
          className="relative z-30 border-b border-amber-400/70 bg-amber-50/95 px-6 py-4 text-noir shadow-sm"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2
                id="blind-onboarding-choice-heading"
                className="text-sm font-bold text-wine flex items-center gap-2"
              >
                <Eye className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>Blind Voice Assistant Activated</span>
              </h2>
              <p className="text-xs text-noir/85">
                {onboardingState === "wake_detected"
                  ? 'Welcome to VOXONIX. Playing prompt: "Say register or sign in." You can also select a choice below.'
                  : 'Listening for your choice: say "Register" to create a new account or "Sign in" to access an existing account.'}
              </p>
            </div>
            <div
              role="group"
              aria-label="Choose account action"
              className="flex flex-wrap items-center gap-2.5 shrink-0"
            >
              <button
                type="button"
                id="btn-onboarding-register"
                aria-label="Register a new Blind accessible account"
                onClick={() => void selectBlindProfileAndStart("wake")}
                className="inline-flex items-center gap-1.5 rounded-full bg-crimson px-5 py-2 text-xs font-bold text-cream shadow-sm transition hover:bg-wine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
              >
                <span>Register</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                id="btn-onboarding-signin"
                aria-label="Sign in to an existing account using Blind voice login"
                onClick={() => void startBlindVoiceLogin()}
                className="inline-flex items-center gap-1.5 rounded-full border border-wine bg-white px-5 py-2 text-xs font-bold text-wine shadow-sm transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign in</span>
              </button>
              <button
                type="button"
                id="btn-onboarding-cancel"
                aria-label="Cancel Blind voice onboarding"
                onClick={lockOutBlindForSession}
                className="inline-flex items-center rounded-full border border-noir/20 bg-background px-4 py-2 text-xs font-semibold text-noir/80 transition hover:bg-noir/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-noir"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {!isAuthenticated && wakeStatus === "permission_denied" && !dismissedMicNotice && (
        <div
          role="region"
          aria-label="Microphone permission notice"
          className="relative z-20 border-b border-noir/15 bg-background/95 px-6 py-2.5 text-xs text-noir"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2">
              <MicOff className="h-3.5 w-3.5 text-crimson shrink-0" aria-hidden="true" />
              <span>
                Microphone access was denied or blocked in browser settings. Visual registration
                works normally; to activate Blind registration by saying &quot;Blind&quot;, enable
                the microphone in browser site settings and retry.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-retry-wake-mic"
                onClick={() => void retryWakePermission()}
                className="rounded-full bg-crimson px-3 py-1 text-xs font-semibold text-cream hover:bg-wine transition"
              >
                Retry Microphone Permission
              </button>
              <button
                type="button"
                onClick={() => setDismissedMicNotice(true)}
                className="rounded-full border border-noir/20 px-3 py-1 text-xs font-semibold text-noir/80 hover:bg-noir/5 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <Link
          to="/"
          className="flex items-baseline gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
        >
          <span className="font-display text-[24px] italic text-wine">Voxonix</span>
          <span className="font-display text-[24px] font-medium tracking-[0.04em] text-noir">
            ✕ AI
          </span>
        </Link>
        <span className="hidden text-[11px] uppercase tracking-[0.28em] text-noir/60 md:block">
          Inclusive Communication Platform
        </span>
        <nav className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition hover:bg-wine focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-5 py-2 text-sm font-semibold text-noir/80 transition hover:bg-noir/5 hover:text-noir focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full bg-crimson px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition hover:bg-wine focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="relative z-10 mx-auto mt-6 max-w-7xl px-6">
        <div className="h-px w-full bg-noir/10" />
      </div>

      {/* ── Hero Section ── */}
      <main id="main-content" className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-12 sm:pt-20">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-crimson/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-crimson mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Universal Multimodal Communication</span>
          </div>

          <h1 className="font-display text-4xl leading-[1.05] sm:text-6xl md:text-7xl font-bold tracking-tight text-noir">
            Every voice heard. <br />
            <span className="italic text-crimson font-serif">Every sign understood.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-noir/70 leading-relaxed max-w-2xl mx-auto">
            A real-time assistive platform connecting Deaf, Non-speaking, Blind, and Hearing
            individuals. Register your communication preference and connect with anyone, anywhere.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-crimson px-8 py-4 text-base font-semibold text-cream shadow-md transition hover:bg-wine focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                <PhoneCall className="h-5 w-5" />
                <span>Open Dashboard ({user?.user_metadata?.display_name || "Account"})</span>
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-crimson px-8 py-4 text-base font-semibold text-cream shadow-md transition hover:bg-wine focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
                >
                  <span>Create Account & Choose Mode</span>
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-noir/20 bg-background/80 px-8 py-4 text-base font-semibold text-noir transition hover:border-noir/40 hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
                >
                  <Lock className="h-4 w-4 text-noir/60" />
                  <span>Sign In</span>
                </Link>
              </>
            )}
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-noir/60">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Screen reader accessible
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Voice-guided registration
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Encrypted peer-to-peer
            </span>
          </div>
        </div>

        {/* ── Choose How You Communicate: 4 Profiles ── */}
        <section aria-labelledby="profiles-heading" className="mt-24">
          <div className="text-center mb-12">
            <h2
              id="profiles-heading"
              className="font-display text-3xl sm:text-4xl font-bold text-noir"
            >
              Choose How You Communicate
            </h2>
            <p className="mt-3 text-base text-noir/65 max-w-xl mx-auto">
              VOXONIX adapts entirely to your way of communicating. Each profile provides dedicated,
              accessible tools tailored specifically for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* 1. Deaf / Hard of Hearing */}
            <div className="rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:shadow-md hover:border-crimson/40">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson/10 text-crimson">
                  <Ear className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-crimson/10 px-3 py-1 text-xs font-bold text-crimson">
                  Visual Communication
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-noir">Deaf / Hard of Hearing</h3>
              <p className="mt-2 text-sm text-noir/65 leading-relaxed">
                Visual-first environment with live streaming speech captions, a persistent
                conversation transcript, Indian Sign Language reference guides, and on-device hand
                gesture tracking.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-noir/80">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  Real-time live speech-to-text captions
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  Persistent transcript history
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  ISL sign language reference & gesture-safe framing
                </li>
              </ul>
              <Link
                to="/register"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-crimson hover:underline"
              >
                Register as Deaf participant &rarr;
              </Link>
            </div>

            {/* 2. Non-speaking */}
            <div className="rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:shadow-md hover:border-wine/40">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-wine/10 text-wine">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-wine/10 px-3 py-1 text-xs font-bold text-wine">
                  AAC & Text-to-Speech
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-noir">Non-speaking</h3>
              <p className="mt-2 text-sm text-noir/65 leading-relaxed">
                Native Augmentative & Alternative Communication (AAC) board with 50+ essential
                phrases across 6 life categories, quick compose buffer, silent messaging, and direct
                Web Audio speech synthesis into calls.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-noir/80">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-wine" />
                  50+ categorized AAC phrases (Emergency, Needs, Social)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-wine" />
                  Custom phrase builder & favorites
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-wine" />
                  Direct Web Audio speech synthesis into call stream
                </li>
              </ul>
              <Link
                to="/register"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-wine hover:underline"
              >
                Register as Non-speaking participant &rarr;
              </Link>
            </div>

            {/* 3. Blind / Low Vision */}
            <div className="rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:shadow-md hover:border-amber-600/40">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
                  <Eye className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-800">
                  Audio & Voice-First
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-noir">Blind / Low Vision</h3>
              <p className="mt-2 text-sm text-noir/65 leading-relaxed">
                Voice-guided registration and navigation, screen-reader optimized landmarks,
                automatic text-to-speech reading of incoming messages, high-contrast mode, and
                Unicode Braille-compatible text.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-noir/80">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Voice-guided registration & accessible keyboard hotkeys
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Incoming message speech readout (TTS)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Braille-compatible Unicode transcript & screen-reader ARIA live
                </li>
              </ul>
              <Link
                to="/register"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
              >
                Register with Voice Guidance &rarr;
              </Link>
            </div>

            {/* 4. Hearing & Speaking (Standard) */}
            <div className="rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:shadow-md hover:border-noir/40">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-noir/10 text-noir">
                  <User className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-noir/10 px-3 py-1 text-xs font-bold text-noir">
                  Standard Audio/Video
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-noir">Hearing & Speaking (Standard)</h3>
              <p className="mt-2 text-sm text-noir/65 leading-relaxed">
                Conventional audio/video call controls, camera and mic management, automatic speech
                transcription for deaf peers, and incoming AAC message playback.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-noir/80">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-noir" />
                  Standard WebRTC audio/video call controls
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-noir" />
                  Automatic speech transcription delivered to Deaf peers
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-noir" />
                  Hear Non-speaking peers via synthesized voice
                </li>
              </ul>
              <Link
                to="/register"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-noir hover:underline"
              >
                Register as Standard participant &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* ── Privacy & Security Invariants ── */}
        <section className="mt-20 rounded-3xl border border-noir/10 bg-background/50 p-8 sm:p-12 text-center max-w-4xl mx-auto">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-noir">
            Security & Privacy Disclosures
          </h2>
          <p className="mt-3 text-sm text-noir/70 max-w-2xl mx-auto leading-relaxed">
            Visual hand-gesture tracking runs in-browser and peer calls connect over encrypted
            WebRTC streams. To support spoken &quot;Blind&quot; registration activation and Blind
            voice-guided registration, VOXONIX requests microphone access and sends completed speech
            segments to Gnani for transcription and spoken readout—speech recognition is not
            exclusively on-device.
          </p>
          <p className="mt-2 text-xs text-noir/60 max-w-xl mx-auto">
            Spoken wake-word segments are used solely to detect &quot;Blind&quot; without persisting
            transcripts, and ordinary typed profiles operate without voice capture.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="rounded-full bg-crimson px-7 py-3 text-sm font-semibold text-cream shadow-sm transition hover:bg-wine"
            >
              Get Started Now
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-noir/20 bg-background px-7 py-3 text-sm font-semibold text-noir transition hover:border-noir/40"
            >
              Sign In to Existing Account
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-noir/10 bg-background/80 py-8 text-center text-xs text-noir/60">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            © {new Date().getFullYear()} VOXONIX. Universal Real-Time Multimodal Assistive Platform.
          </p>
          <div className="flex gap-6">
            <Link to="/register" className="hover:text-crimson">
              Create Account
            </Link>
            <Link to="/login" className="hover:text-crimson">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
