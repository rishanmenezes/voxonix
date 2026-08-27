import { useEffect } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { ArrowUpRight, Video, Mic, Accessibility, Wifi } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/auth-context";

export const Route = createFileRoute("/")({
  // Authenticated users who land on the public root are sent straight to their dashboard.
  // Public visitors (no session) see the landing page as normal.
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "VOXONIX — Breaking Communication Barriers" },
      {
        name: "description",
        content:
          "A real-time communication platform for Deaf, Blind, Mute and non-disabled users. Accessible by design.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-noir">
      <InteractiveBackground />

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-[22px] italic text-wine">Voxonix</span>
          <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">
            ✕ AI
          </span>
        </Link>
        <span className="hidden text-[11px] uppercase tracking-[0.28em] text-noir/55 md:block">
          Issue Nº 01 · Communication, made accessible
        </span>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/login"
            className="rounded-full px-3 py-2 text-sm text-noir/75 transition hover:text-noir"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="group inline-flex items-center gap-1.5 rounded-full bg-noir px-4 py-2 text-sm font-medium text-cream transition hover:bg-wine"
          >
            Get started
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </nav>
      </header>

      <div className="relative z-10 mx-auto mt-6 max-w-7xl px-6">
        <div className="hairline" />
      </div>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="grid items-end gap-10 lg:grid-cols-12">
          {/* Left — headline */}
          <div className="lg:col-span-8">
            <div className="animate-fade-up flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-crimson">
              <span className="h-px w-8 bg-crimson" />A premium accessibility platform
            </div>
            <h1 className="mt-6 animate-fade-up font-display text-[56px] leading-[0.95] text-noir [animation-delay:120ms] sm:text-[88px] md:text-[112px] lg:text-[128px]">
              Breaking
              <br />
              <em className="italic text-crimson">communication</em>
              <br />
              <span className="text-wine">barriers.</span>
            </h1>
          </div>

          {/* Right — copy + auth CTAs */}
          <div className="animate-fade-up lg:col-span-4 lg:pb-6 [animation-delay:240ms]">
            <p className="max-w-sm text-base leading-relaxed text-noir/75">
              Voxonix is a real-time communication platform designed for people who communicate
              through speech, text, signing, captions, or assistive interaction.
            </p>

            <div className="mt-7 flex max-w-sm flex-col gap-3">
              {/* Primary CTA */}
              <Link
                to="/register"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-cream transition hover:bg-wine"
              >
                Get started
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>

              {/* Secondary CTA */}
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-full border border-noir/30 px-6 py-3 text-sm font-medium text-noir transition hover:border-noir hover:bg-noir hover:text-cream"
              >
                Sign in
              </Link>

              {/* Trust line */}
              <p className="pt-1 text-center text-[11px] text-noir/50">
                No account yet? Create one in seconds.
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat ribbon ── */}
        <div className="mt-20 overflow-hidden rounded-2xl bg-wine text-cream">
          <div className="grid divide-y divide-cream/15 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between px-7 py-7 sm:flex-col sm:items-start sm:gap-3"
              >
                <span className="font-display text-5xl text-cream sm:text-6xl">{s.value}</span>
                <span className="text-[11px] uppercase tracking-[0.24em] text-cream/65">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Marquee strip ── */}
        <div className="mt-12 overflow-hidden border-y border-noir/20 py-4">
          <div className="flex w-max animate-marquee gap-12 font-display text-2xl italic text-noir/60">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex items-center gap-12 pr-12">
                {marqueeWords.map((w, i) => (
                  <span key={i} className="flex items-center gap-12">
                    <span>{w}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capabilities — two sections: LIVE NOW + COMING NEXT ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="font-display text-4xl text-noir sm:text-5xl">
            Designed for <em className="italic text-crimson">every voice</em>.
          </h2>
          <span className="hidden text-[11px] uppercase tracking-[0.28em] text-noir/55 sm:block">
            §01 · Capabilities
          </span>
        </div>

        {/* Live now */}
        <div className="mb-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live now
          </span>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl bg-noir sm:grid-cols-2 lg:grid-cols-4">
          {featuresLive.map((f, i) => {
            const isAccent = i === 1;
            return (
              <article
                key={f.title}
                className={
                  "group relative animate-fade-up p-7 transition " +
                  (isAccent
                    ? "bg-crimson text-cream hover:bg-wine"
                    : "bg-cream text-noir hover:bg-card")
                }
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      "font-display text-sm italic " + (isAccent ? "text-cream/85" : "text-crimson")
                    }
                  >
                    Nº 0{i + 1}
                  </span>
                  <f.icon
                    className={
                      "h-5 w-5 transition " +
                      (isAccent ? "text-cream" : "text-noir/70 group-hover:text-crimson")
                    }
                  />
                </div>
                <h3
                  className={
                    "mt-10 font-display text-2xl leading-tight " +
                    (isAccent ? "text-cream" : "text-noir")
                  }
                >
                  {f.title}
                </h3>
                <p
                  className={
                    "mt-3 text-sm leading-relaxed " + (isAccent ? "text-cream/80" : "text-noir/65")
                  }
                >
                  {f.desc}
                </p>
              </article>
            );
          })}
        </div>

        {/* Coming next */}
        <div className="mb-2 mt-10 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-noir/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-noir/50">
            <span className="h-1.5 w-1.5 rounded-full bg-noir/30" />
            Coming next
          </span>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-noir/12 sm:grid-cols-2 lg:grid-cols-4">
          {featuresNext.map((f, i) => (
            <article
              key={f.title}
              className="group relative animate-fade-up bg-background/60 p-7 transition hover:bg-card"
              style={{ animationDelay: `${500 + i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-sm italic text-noir/35">Nº 0{i + 5}</span>
                <f.icon className="h-5 w-5 text-noir/30 transition group-hover:text-noir/60" />
              </div>
              <h3 className="mt-10 font-display text-2xl leading-tight text-noir/50">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-noir/40">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── AI layer section ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="overflow-hidden rounded-3xl border border-noir/12 bg-background/40 px-8 py-14 sm:px-16">
          <div className="mb-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-noir/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-noir/50">
              <span className="h-1.5 w-1.5 rounded-full bg-noir/30" />
              Coming next
            </span>
          </div>
          <h2 className="mt-4 font-display text-3xl text-noir sm:text-4xl">
            The <em className="italic text-crimson">AI layer</em>.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-noir/65">
            Voxonix will route each participant&apos;s communication through a modality conversion
            layer — turning speech into text, text into speech, and signing into captions, all in
            real time.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {aiFlows.map((flow) => (
              <div
                key={flow}
                className="rounded-xl border border-noir/12 bg-background px-4 py-3 text-center text-xs font-medium text-noir/55"
              >
                {flow}
              </div>
            ))}
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-noir/35">
            Not yet implemented · In development
          </p>
        </div>
      </section>

      {/* ── Accessibility profiles ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="font-display text-4xl text-noir sm:text-5xl">
            Built for <em className="italic text-crimson">everyone</em>.
          </h2>
          <span className="hidden text-[11px] uppercase tracking-[0.28em] text-noir/55 sm:block">
            §02 · Profiles
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {profiles.map((p) => (
            <div
              key={p.label}
              className="rounded-2xl border border-noir/12 bg-card p-6 transition hover:border-crimson/40"
            >
              <span className="font-display text-3xl">{p.icon}</span>
              <h3 className="mt-4 font-display text-xl text-noir">{p.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-noir/60">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Manifesto ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-noir px-8 py-16 text-cream sm:px-16 sm:py-24">
          <div
            className="absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(139,0,0,0.55), transparent 70%)" }}
          />
          <div
            className="absolute -bottom-32 -left-24 h-[360px] w-[360px] rounded-full blur-3xl"
            style={{
              background: "radial-gradient(circle, rgba(237,231,199,0.18), transparent 70%)",
            }}
          />
          <div className="relative">
            <span className="font-display text-xs italic text-crimson">§03 · Manifesto</span>
            <p className="mt-4 font-display text-3xl leading-tight sm:text-5xl">
              <em className="italic text-crimson">&ldquo;</em>A room where everyone is heard —
              <br className="hidden sm:block" />
              spoken, signed, captioned, or typed.
              <em className="italic text-crimson">&rdquo;</em>
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-[0.28em] text-cream/60">
                — The Voxonix manifesto
              </span>
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 rounded-full bg-cream px-6 py-3 text-sm font-medium text-noir transition hover:bg-cream/90"
              >
                Create your account
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-noir/20 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="font-display text-xl italic text-wine">Voxonix</span>
              <p className="mt-1 text-xs text-noir/50">Communication for everyone.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm text-noir/60">
              <Link to="/" className="transition hover:text-noir">
                Home
              </Link>
              <Link to="/login" className="transition hover:text-noir">
                Sign in
              </Link>
              <Link to="/register" className="font-medium text-crimson transition hover:text-wine">
                Create account
              </Link>
            </nav>
          </div>
          <div className="mt-8 border-t border-noir/10 pt-6 text-[11px] text-noir/40">
            © {new Date().getFullYear()} Voxonix · Development build · Not for production use
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const stats = [
  { value: "04", label: "Accessibility profiles" },
  { value: "02", label: "Participants per room" },
  { value: "01", label: "Real-time audio + video" },
  { value: "01", label: "Shareable room code" },
];

const marqueeWords = [
  "Real-time video",
  "Accessibility profiles",
  "Room codes",
  "WebRTC",
  "Camera controls",
  "Microphone controls",
];

const featuresLive = [
  {
    icon: Video,
    title: "Two-person video call",
    desc: "Low-latency WebRTC video and audio between two participants over a secure room code.",
  },
  {
    icon: Mic,
    title: "Camera & mic controls",
    desc: "Toggle camera and microphone mid-call. Remote peer sees your camera-off state immediately.",
  },
  {
    icon: Accessibility,
    title: "Accessibility profiles",
    desc: "Four profiles — Deaf, Blind, Mute, Non-disabled — that will guide how Voxonix adapts for each user.",
  },
  {
    icon: Wifi,
    title: "Room codes & links",
    desc: "Create a room, get a shareable code. Anyone with the code or link can join in seconds.",
  },
];

const featuresNext = [
  {
    icon: Video,
    title: "Live captions",
    desc: "Real-time speech-to-text overlaid in the call for Deaf and hard-of-hearing participants.",
  },
  {
    icon: Mic,
    title: "Sign recognition",
    desc: "On-device gesture recognition that converts signing into readable text or synthesised speech.",
  },
  {
    icon: Accessibility,
    title: "Text-to-speech",
    desc: "Natural speech synthesis so non-speaking participants can be heard through the call.",
  },
  {
    icon: Wifi,
    title: "Adaptive routing",
    desc: "AI-driven output routing that selects the right modality for each participant automatically.",
  },
];

const aiFlows = [
  "Speech → Text",
  "Speech → Caption",
  "Sign → Text",
  "Sign → Speech",
  "Text → Speech",
];

const profiles = [
  {
    icon: "👂",
    label: "Deaf",
    desc: "An accessibility profile that prepares Voxonix for caption-first and visual communication as new capabilities roll out.",
  },
  {
    icon: "👁️",
    label: "Blind",
    desc: "An accessibility profile that prepares Voxonix for audio-first interaction and assistive-technology compatibility.",
  },
  {
    icon: "🤐",
    label: "Mute / Non-speaking",
    desc: "An accessibility profile that prepares Voxonix for text-first communication and future speech synthesis.",
  },
  {
    icon: "🙂",
    label: "Non-disabled",
    desc: "Full access to the communication room with optional accessibility overlays available on request.",
  },
];
