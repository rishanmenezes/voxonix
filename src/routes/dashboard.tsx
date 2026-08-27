import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-helpers";
import { useAuth } from "@/context/auth-context";
import { useAccessibility } from "@/context/accessibility-context";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import {
  ALL_PROFILES_LIST,
  type AccessibilityProfile,
} from "@/lib/accessibility";
import {
  Video,
  LogIn,
  User,
  Settings,
  LogOut,
  Plus,
  ArrowRight,
  MessageSquare,
  Volume2,
  Hand,
  Keyboard,
  Eye,
  Ear,
  Sliders,
  Check,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Dashboard — VOXONIX" },
      { name: "description", content: "Your Voxonix accessible communication dashboard." },
    ],
  }),
  component: DashboardPage,
});

function ProfileIcon({ icon }: { icon: "Eye" | "Ear" | "MessageSquare" | "User" }) {
  switch (icon) {
    case "Eye":
      return <Eye className="h-5 w-5" />;
    case "Ear":
      return <Ear className="h-5 w-5" />;
    case "MessageSquare":
      return <MessageSquare className="h-5 w-5" />;
    case "User":
    default:
      return <User className="h-5 w-5" />;
  }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const { user, signOut } = useAuth();
  const { profile, profileInfo, preferences, setProfile, updatePreferences } = useAccessibility();
  const navigate = useNavigate();

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [isChangingProfile, setIsChangingProfile] = useState(false);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Friend";

  const handleStartCall = () => {
    setCreatingRoom(true);
    // Generate clean 6-character room code
    const roomCode = Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
    ).join("");

    navigate({ to: "/room/$roomId", params: { roomId: roomCode } });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    navigate({ to: "/room/$roomId", params: { roomId: code } });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const currentMode = profile || "standard";

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
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
              className="rounded-full px-4 py-2 text-sm font-medium text-crimson transition hover:bg-crimson/10"
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
              className="rounded-full px-4 py-2 text-sm text-noir/70 transition hover:bg-noir/5 hover:text-noir"
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

      {/* ── Main Dashboard Workspace ────────────────────────────────────────── */}
      <main className="relative z-10 mx-auto max-w-4xl px-6 py-10 space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-crimson">
              Multimodal 1-to-1 Workspace
            </span>
            <h1 className="mt-1 font-display text-4xl text-noir sm:text-5xl">
              {getGreeting()}, <em className="italic text-crimson">{displayName}</em> 👋
            </h1>
          </div>

          {/* Active Communication Mode Badge & Switcher */}
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-noir/15 bg-card/90 px-4 py-2.5 shadow-sm backdrop-blur flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-crimson/10 text-crimson">
                {profileInfo ? <ProfileIcon icon={profileInfo.icon} /> : <User className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-[10px] uppercase font-bold text-noir/50 tracking-wider">
                  Your Communication Mode
                </p>
                <p className="text-sm font-bold text-noir">
                  {profileInfo?.label || "Standard"} •{" "}
                  <span className="text-crimson font-medium">
                    {profileInfo?.modeDescription || "Balanced"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChangingProfile(!isChangingProfile)}
                className="ml-2 rounded-lg border border-noir/15 bg-background px-2.5 py-1 text-xs font-semibold text-noir hover:border-crimson hover:text-crimson transition"
              >
                {isChangingProfile ? "Done" : "Change"}
              </button>
            </div>
          </div>
        </div>

        {/* ── First-Time or In-Line Mode Selector ────────────────────────────── */}
        {isChangingProfile && (
          <section className="animate-in fade-in slide-in-from-top-2 duration-200 rounded-3xl border border-crimson/30 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-noir">
                  How would you like Voxonix to help you communicate?
                </h2>
                <p className="text-sm text-noir/65 mt-0.5">
                  Selecting a mode adjusts default tools and presentation. You can still use any feature.
                </p>
              </div>
              <button
                onClick={() => setIsChangingProfile(false)}
                className="text-xs font-semibold text-crimson hover:underline"
              >
                Done
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_PROFILES_LIST.map((p) => {
                const isSelected = currentMode === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProfile(p.id);
                    }}
                    className={`flex flex-col p-4 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-crimson bg-crimson/5 ring-2 ring-crimson shadow-md"
                        : "border-noir/15 bg-background/60 hover:border-noir/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-noir/5 text-noir">
                          <ProfileIcon icon={p.icon} />
                        </span>
                        <div>
                          <span className="text-base font-bold text-noir">{p.label}</span>
                          <span className="ml-2 text-xs font-semibold text-crimson">
                            {p.modeDescription}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="h-5 w-5 rounded-full bg-crimson text-cream flex items-center justify-center">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-noir/70 leading-relaxed">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Primary Action Stage: 1-to-1 Call Launcher ─────────────────────── */}
        <section className="grid gap-6 sm:grid-cols-2">
          {/* Start 1-to-1 Call */}
          <div className="group relative overflow-hidden rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:border-crimson/50 hover:shadow-md">
            <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-crimson/10 blur-2xl transition group-hover:bg-crimson/15" />
            <div className="relative">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson text-cream shadow-md">
                <Plus className="h-6 w-6 stroke-[2.5]" />
              </div>
              <h2 className="font-display text-3xl font-bold text-noir">Start 1-to-1 Call</h2>
              <p className="mt-2 text-sm leading-relaxed text-noir/65">
                Generate an instant, secure room code and invite your communication partner.
              </p>
              <button
                onClick={handleStartCall}
                disabled={creatingRoom}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-crimson px-7 py-3.5 text-sm font-semibold text-cream shadow-md transition hover:bg-wine disabled:opacity-60"
              >
                <span>{creatingRoom ? "Connecting…" : "Start 1-to-1 Call"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Join Call */}
          <div className="group relative overflow-hidden rounded-3xl border border-noir/15 bg-card p-8 shadow-sm transition hover:border-noir/30">
            <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-noir/5 blur-2xl transition group-hover:bg-noir/10" />
            <div className="relative">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-noir/10 text-noir">
                <LogIn className="h-6 w-6 stroke-[2]" />
              </div>
              <h2 className="font-display text-3xl font-bold text-noir">Join a Call</h2>
              <p className="mt-2 text-sm leading-relaxed text-noir/65">
                Have a 6-character room code? Enter it below to join an active room.
              </p>
              <form onSubmit={handleJoinRoom} className="mt-6 flex gap-2">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC99X"
                  className="flex-1 rounded-2xl border border-noir/15 bg-background/80 px-4 py-3 text-sm font-mono uppercase tracking-wider text-noir placeholder:text-noir/35 focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/25"
                  maxLength={10}
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-2xl bg-noir px-6 py-3 text-sm font-semibold text-cream transition hover:bg-crimson"
                >
                  Join
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* ── Profile-Specific Recommended Tools ────────────────────────────── */}
        <section className="rounded-3xl border border-noir/15 bg-card/80 p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-crimson" />
              <h3 className="font-display text-xl font-bold text-noir">
                Recommended for your {profileInfo?.label || "Standard"} Mode
              </h3>
            </div>
            <span className="text-xs text-noir/50">All tools accessible below</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {currentMode === "deaf" && (
              <>
                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <MessageSquare className="h-4 w-4 text-crimson" />
                    <span>Live Captions</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Real-time speech-to-text subtitle streaming with sub-second latency.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Enabled by default
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Hand className="h-4 w-4 text-amber-600" />
                    <span>Sign Recognition</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    MediaPipe handshape landmark tracking and temporal ASL gesture classifier.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    Ready in Call
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Video className="h-4 w-4 text-wine" />
                    <span>Gesture-Safe Framing</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Prevents video letterboxing cropping so your hands remain fully in view.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-wine bg-wine/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
              </>
            )}

            {currentMode === "blind" && (
              <>
                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Volume2 className="h-4 w-4 text-wine" />
                    <span>Speech Output (TTS)</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Speaks incoming captions aloud with acoustic feedback cancellation.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Sliders className="h-4 w-4 text-crimson" />
                    <span>Voice & Speed Controls</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Customize voice pitch, speech rate, and ducking sensitivity.
                  </p>
                  <Link
                    to="/settings"
                    className="inline-block mt-2 text-[10px] font-bold text-crimson underline"
                  >
                    Adjust in Settings →
                  </Link>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Eye className="h-4 w-4 text-noir" />
                    <span>High Contrast Mode</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Maximized visual contrast for assistive screen-reader compatibility.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-noir bg-noir/10 px-2 py-0.5 rounded-full">
                    Standard
                  </span>
                </div>
              </>
            )}

            {currentMode === "non-speaking" && (
              <>
                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Keyboard className="h-4 w-4 text-crimson" />
                    <span>Type to Speak</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Quick keyboard entry instantly synthesizes voice & broadcasts subtitles.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Enabled
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <MessageSquare className="h-4 w-4 text-wine" />
                    <span>Quick Responses</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    One-click preset communication cards (Yes, No, Help, Please wait).
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-wine bg-wine/10 px-2 py-0.5 rounded-full">
                    Ready in Call
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Volume2 className="h-4 w-4 text-emerald-700" />
                    <span>Audible Synthesis</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Outputs your typed message to the remote peer's speakers.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
              </>
            )}

            {currentMode === "standard" && (
              <>
                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <MessageSquare className="h-4 w-4 text-crimson" />
                    <span>Live Captions</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Real-time speech-to-text transcription for all call participants.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Volume2 className="h-4 w-4 text-wine" />
                    <span>Speech Output</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Optional text-to-speech audio reader available with one click.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-noir/60 bg-noir/10 px-2 py-0.5 rounded-full">
                    Available
                  </span>
                </div>

                <div className="rounded-2xl border border-noir/10 bg-background/60 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-noir">
                    <Sliders className="h-4 w-4 text-noir" />
                    <span>Multimodal Tools</span>
                  </div>
                  <p className="text-xs text-noir/65">
                    Enable sign recognition, typed voice, or custom contrast on demand.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-noir/60 bg-noir/10 px-2 py-0.5 rounded-full">
                    Configurable
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Quick Preferences Bar ─────────────────────────────────────────── */}
        <section className="rounded-3xl border border-noir/10 bg-background/40 p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-xs uppercase font-bold tracking-wider text-noir/50">
              Quick Communication Preferences
            </h4>
            <p className="text-xs text-noir/65 mt-0.5">Toggle default accessibility features</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => updatePreferences({ captionsEnabled: !preferences.captionsEnabled })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition border ${
                preferences.captionsEnabled
                  ? "bg-noir text-cream border-noir"
                  : "bg-background text-noir/60 border-noir/20 hover:border-noir"
              }`}
            >
              Captions: {preferences.captionsEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={() =>
                updatePreferences({ speechOutputEnabled: !preferences.speechOutputEnabled })
              }
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition border ${
                preferences.speechOutputEnabled
                  ? "bg-wine text-cream border-wine"
                  : "bg-background text-noir/60 border-noir/20 hover:border-wine"
              }`}
            >
              Speech Output: {preferences.speechOutputEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={() =>
                updatePreferences({ signRecognitionEnabled: !preferences.signRecognitionEnabled })
              }
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition border ${
                preferences.signRecognitionEnabled
                  ? "bg-amber-600 text-cream border-amber-600"
                  : "bg-background text-noir/60 border-noir/20 hover:border-amber-600"
              }`}
            >
              Sign Recognition: {preferences.signRecognitionEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={() =>
                updatePreferences({ typeToSpeakEnabled: !preferences.typeToSpeakEnabled })
              }
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition border ${
                preferences.typeToSpeakEnabled
                  ? "bg-crimson text-cream border-crimson"
                  : "bg-background text-noir/60 border-noir/20 hover:border-crimson"
              }`}
            >
              Type to Speak: {preferences.typeToSpeakEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </section>

        {/* ── Universal Media Diagnostics & Sandboxes ────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            to="/profile"
            className="group flex items-center gap-3 rounded-2xl border border-noir/12 bg-card p-4 transition hover:border-noir/30"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-noir/5 transition group-hover:bg-noir/10">
              <User className="h-5 w-5 text-noir/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-noir">Profile & Mode</h3>
              <p className="text-xs text-noir/50">Manage account & mode</p>
            </div>
          </Link>

          <Link
            to="/settings"
            className="group flex items-center gap-3 rounded-2xl border border-noir/12 bg-card p-4 transition hover:border-noir/30"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-noir/5 transition group-hover:bg-noir/10">
              <Settings className="h-5 w-5 text-noir/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-noir">Settings</h3>
              <p className="text-xs text-noir/50">Voices, rates & contrast</p>
            </div>
          </Link>

          <Link
            to="/media-test"
            className="group flex items-center gap-3 rounded-2xl border border-noir/12 bg-card p-4 transition hover:border-noir/30"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-noir/5 transition group-hover:bg-noir/10">
              <Video className="h-5 w-5 text-noir/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-noir">Hardware Test</h3>
              <p className="text-xs text-noir/50">Test camera & microphone</p>
            </div>
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-4xl px-6 pb-12">
        <p className="text-center text-xs text-noir/40">
          VOXONIX — Unified Real-Time Multimodal Communication Platform
        </p>
      </footer>
    </div>
  );
}
