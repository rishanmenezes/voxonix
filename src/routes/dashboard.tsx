import { useState, useEffect, useCallback, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-helpers";
import { useAuth } from "@/hooks/use-auth";
import { useAccessibility } from "@/hooks/use-accessibility";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { type PrimaryProfile, normalizePrimaryProfile } from "@/lib/capabilities";
import { AACStore, DEFAULT_AAC_PHRASES, AAC_CATEGORIES } from "@/lib/aac/aac-store";
import { textToBraille } from "@/lib/accessibility/braille";
import { getSharedGnaniTtsProvider } from "@/lib/tts/gnani-tts-provider";
import {
  Video,
  LogIn,
  Settings,
  LogOut,
  Plus,
  ArrowRight,
  MessageSquare,
  Volume2,
  VolumeX,
  Keyboard,
  Hand,
  Eye,
  Ear,
  Sliders,
  Check,
  Sparkles,
  Binary,
  Star,
  Mic,
  Camera,
  RotateCcw,
  BookOpen,
  Send,
  Trash2,
  ShieldCheck,
  User,
} from "lucide-react";
import { ISLReferenceModal } from "@/components/media/ISLReferenceModal";
import { SignSlidesReference } from "@/components/media/SignSlidesReference";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Dashboard — VOXONIX" },
      {
        name: "description",
        content: "Your personalized Voxonix accessible communication dashboard.",
      },
    ],
  }),
  component: DashboardPage,
});

function speakText(text: string) {
  if (typeof window === "undefined") return;
  void getSharedGnaniTtsProvider()
    .speakText(text)
    .catch((err) => {
      console.warn("[Dashboard speakText] Gnani Timbre TTS unavailable:", err);
    });
}

function DashboardPage() {
  const { user, signOut } = useAuth();
  const { preferences, updatePreferences } = useAccessibility();
  const navigate = useNavigate();

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Normalize user's registered profile into exactly one of the 4 primary profiles
  const profile: PrimaryProfile = useMemo(() => {
    return normalizePrimaryProfile(user?.user_metadata?.accessibility_profile);
  }, [user]);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Participant";

  const handleStartCall = useCallback(() => {
    setCreatingRoom(true);
    const roomCode = Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
    ).join("");
    navigate({ to: "/room/$roomId", params: { roomId: roomCode } });
  }, [navigate]);

  const handleJoinRoom = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const code = roomCodeInput.trim().toUpperCase();
      if (!code) return;
      navigate({ to: "/room/$roomId", params: { roomId: code } });
    },
    [navigate, roomCodeInput],
  );

  // Listen for Blind voice assistant dashboard actions (e.g. "start call", "join call")
  useEffect(() => {
    const handleDashboardAction = (event: Event) => {
      const customEvent = event as CustomEvent<{
        action: string;
        payload?: Record<string, unknown>;
      }>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.action === "start_call") {
        handleStartCall();
      } else if (detail.action === "join_call") {
        const code = (
          typeof detail.payload?.code === "string" ? detail.payload.code : roomCodeInput
        )
          .trim()
          .toUpperCase();
        if (code) {
          navigate({ to: "/room/$roomId", params: { roomId: code } });
        }
      }
    };

    window.addEventListener("voxonix:dashboard-action", handleDashboardAction);
    return () => window.removeEventListener("voxonix:dashboard-action", handleDashboardAction);
  }, [handleStartCall, navigate, roomCodeInput]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* Top Header */}
      <header className="relative z-10 border-b border-noir/10 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-baseline gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
          >
            <span className="font-display text-[22px] italic text-wine">Voxonix</span>
            <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">
              ✕ AI
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-noir/15 bg-card px-3.5 py-1 text-xs font-semibold text-noir">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{displayName}</span>
              <span className="text-noir/40">·</span>
              <span className="uppercase text-[10px] text-crimson font-bold">{profile}</span>
            </span>

            <Link
              to="/settings"
              className="rounded-full p-2 text-noir/70 transition hover:bg-noir/5 hover:text-noir"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>

            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-noir/15 px-3 py-1.5 text-xs font-medium text-noir/70 transition hover:bg-crimson/10 hover:text-crimson"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Stage — Segregated Strictly By Profile */}
      <main id="main-content" className="relative z-10 mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Profile-Specific View Component */}
        {profile === "deaf" && (
          <DeafDashboardView
            displayName={displayName}
            onStartCall={handleStartCall}
            onJoinCall={handleJoinRoom}
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            creatingRoom={creatingRoom}
          />
        )}

        {profile === "non-speaking" && (
          <NonSpeakingDashboardView
            displayName={displayName}
            onStartCall={handleStartCall}
            onJoinCall={handleJoinRoom}
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            creatingRoom={creatingRoom}
          />
        )}

        {profile === "blind" && (
          <BlindDashboardView
            displayName={displayName}
            onStartCall={handleStartCall}
            onJoinCall={handleJoinRoom}
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            creatingRoom={creatingRoom}
            preferences={preferences}
            updatePreferences={updatePreferences}
          />
        )}

        {profile === "standard" && (
          <StandardDashboardView
            displayName={displayName}
            onStartCall={handleStartCall}
            onJoinCall={handleJoinRoom}
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            creatingRoom={creatingRoom}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEAF / HARD OF HEARING DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardViewProps {
  displayName: string;
  onStartCall: () => void;
  onJoinCall: (e?: React.FormEvent) => void;
  roomCodeInput: string;
  setRoomCodeInput: (val: string) => void;
  creatingRoom: boolean;
}

function DeafDashboardView({
  displayName,
  onStartCall,
  onJoinCall,
  roomCodeInput,
  setRoomCodeInput,
  creatingRoom,
}: DashboardViewProps) {
  const [isISLOpen, setIsISLOpen] = useState(false);
  const [isSignSlidesOpen, setIsSignSlidesOpen] = useState(false);
  const [testCaptions, setTestCaptions] = useState<string[]>([
    "Partner: Hello Alex! I can see and hear you clearly.",
    "System: Speech-to-text live stream connected with low latency.",
  ]);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl border border-crimson/20 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson/10 text-crimson">
            <Ear className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-crimson">
              Registered Profile · Deaf / Hard of Hearing
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">
              Welcome, {displayName}
            </h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-noir/70 max-w-2xl leading-relaxed">
          Your dashboard is configured for visual-first communication. Live speech-to-text captions,
          persistent transcripts, and Indian Sign Language visual tools are enabled by default.
        </p>
      </div>

      {/* Call Launch Stage */}
      <CallLauncherSection
        onStartCall={onStartCall}
        onJoinCall={onJoinCall}
        roomCodeInput={roomCodeInput}
        setRoomCodeInput={setRoomCodeInput}
        creatingRoom={creatingRoom}
        badgeText="Visual Mode Active · Captions Enabled"
      />

      {/* Deaf-Specific Tool Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ISL Reference & Fingerspelling Deck */}
        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-crimson" />
              <h2 className="font-display text-xl font-bold text-noir">
                Indian Sign Language (ISL)
              </h2>
            </div>
            <span className="text-xs font-semibold text-crimson bg-crimson/10 px-2.5 py-1 rounded-full">
              Reference
            </span>
          </div>
          <p className="mt-2 text-xs text-noir/65 leading-relaxed">
            Review two-handed manual fingerspelling for all 26 English letters (A–Z) and verified
            conversational signs.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setIsISLOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-5 py-2.5 text-xs font-semibold text-cream shadow hover:bg-wine transition"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Open 26-Letter ISL Chart</span>
            </button>
            <button
              onClick={() => setIsSignSlidesOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-noir/20 bg-background px-5 py-2.5 text-xs font-semibold text-noir hover:bg-noir/5 transition"
            >
              <Hand className="h-3.5 w-3.5 text-amber-600" />
              <span>Fingerspelling Slides Deck</span>
            </button>
          </div>
        </div>

        {/* Live Captioning & Transcript Vault */}
        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-crimson" />
              <h2 className="font-display text-xl font-bold text-noir">
                Live Captions & Persistent Transcript
              </h2>
            </div>
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
              Ready in Call
            </span>
          </div>
          <p className="mt-2 text-xs text-noir/65 leading-relaxed">
            In every call, your partner's speech is automatically transcribed into floating
            subtitles and recorded in a persistent, scrollable transcript.
          </p>

          <div className="mt-4 rounded-2xl border border-noir/10 bg-background/60 p-3 space-y-2 font-mono text-xs text-noir/80">
            {testCaptions.map((cap, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-crimson font-bold">›</span>
                <span>{cap}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] text-noir/50">Gesture-safe camera framing enabled</span>
            <Link to="/media-test" className="text-xs font-bold text-crimson hover:underline">
              Test Camera Framing &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Modals */}
      <ISLReferenceModal isOpen={isISLOpen} onClose={() => setIsISLOpen(false)} />
      <SignSlidesReference isOpen={isSignSlidesOpen} onClose={() => setIsSignSlidesOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NON-SPEAKING DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────────────────

function NonSpeakingDashboardView({
  displayName,
  onStartCall,
  onJoinCall,
  roomCodeInput,
  setRoomCodeInput,
  creatingRoom,
}: DashboardViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [composedText, setComposedText] = useState<string>("");
  const [customInput, setCustomInput] = useState<string>("");
  const [phrases, setPhrases] = useState(() => AACStore.getInstance().getAllPhrases());

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    const store = AACStore.getInstance();
    store.addCustomPhrase(customInput.trim());
    setPhrases(store.getAllPhrases());
    setSelectedCategory("custom");
    setCustomInput("");
  };

  const handleSpeakComposed = () => {
    if (!composedText.trim()) return;
    speakText(composedText);
  };

  const filteredPhrases = phrases.filter((p) => {
    if (selectedCategory === "all") return true;
    if (selectedCategory === "favorites") return p.isFavorite;
    return p.category === selectedCategory;
  });

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl border border-wine/20 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-wine/10 text-wine">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-wine">
              Registered Profile · Non-speaking
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">
              Welcome, {displayName}
            </h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-noir/70 max-w-2xl leading-relaxed">
          Your dashboard provides dedicated Augmentative & Alternative Communication (AAC) tools.
          Select or type phrases to transmit them as captions or synthesize audio directly into your
          calls.
        </p>
      </div>

      {/* Call Launch Stage */}
      <CallLauncherSection
        onStartCall={onStartCall}
        onJoinCall={onJoinCall}
        roomCodeInput={roomCodeInput}
        setRoomCodeInput={setRoomCodeInput}
        creatingRoom={creatingRoom}
        badgeText="AAC Board & Voice Synthesis Ready"
      />

      {/* Native AAC Communication Board Stage */}
      <section className="rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-noir">
              Native AAC Communication Board
            </h2>
            <p className="text-xs text-noir/65">
              50+ categorized quick responses. Click any phrase to add it to your compose buffer.
            </p>
          </div>
          <span className="text-xs font-bold text-wine bg-wine/10 px-3 py-1 rounded-full">
            {phrases.length} Phrases Available
          </span>
        </div>

        {/* Compose Buffer */}
        <div className="rounded-2xl border border-wine/30 bg-background/80 p-4 space-y-3">
          <label
            htmlFor="aac-buffer"
            className="block text-xs font-bold uppercase tracking-wider text-noir/60"
          >
            Active Compose Buffer
          </label>
          <div className="flex gap-2">
            <input
              id="aac-buffer"
              type="text"
              value={composedText}
              onChange={(e) => setComposedText(e.target.value)}
              placeholder="Select phrases below or type your custom message..."
              className="flex-1 rounded-xl border border-noir/20 bg-background px-4 py-2.5 text-sm text-noir focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/25"
            />
            <button
              onClick={handleSpeakComposed}
              disabled={!composedText.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-wine px-5 py-2.5 text-xs font-semibold text-cream shadow hover:bg-noir transition disabled:opacity-50"
            >
              <Volume2 className="h-4 w-4" />
              <span>Test Voice</span>
            </button>
            <button
              onClick={() => setComposedText("")}
              disabled={!composedText}
              className="rounded-xl border border-noir/20 px-3 py-2 text-xs font-semibold text-noir/60 hover:text-crimson hover:border-crimson transition disabled:opacity-30"
              title="Clear Buffer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {AAC_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
                selectedCategory === cat.id
                  ? "bg-wine text-cream border-wine shadow-sm"
                  : "bg-background text-noir/70 border-noir/15 hover:border-noir/30"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Phrase Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
          {filteredPhrases.map((phrase) => (
            <button
              key={phrase.id}
              onClick={() => {
                setComposedText((prev) => (prev ? `${prev} ${phrase.text}` : phrase.text));
              }}
              className="group flex flex-col justify-between p-3 rounded-xl border border-noir/10 bg-background/60 hover:border-wine hover:bg-wine/5 text-left transition"
            >
              <span className="text-xs font-medium text-noir group-hover:text-wine leading-snug">
                {phrase.text}
              </span>
              <span className="mt-2 text-[10px] uppercase font-bold text-noir/40 group-hover:text-wine/60">
                {phrase.category}
              </span>
            </button>
          ))}
        </div>

        {/* Custom Phrase Creator */}
        <form onSubmit={handleAddCustom} className="pt-4 border-t border-noir/10 flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Add a new custom phrase to your AAC board..."
            className="flex-1 rounded-xl border border-noir/20 bg-background px-4 py-2 text-xs text-noir focus:border-wine focus:outline-none"
          />
          <button
            type="submit"
            disabled={!customInput.trim()}
            className="rounded-xl bg-noir px-4 py-2 text-xs font-semibold text-cream hover:bg-wine transition disabled:opacity-50"
          >
            Save Custom Phrase
          </button>
        </form>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BLIND / LOW VISION DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────────────────

import type { CommunicationPreferences } from "@/lib/accessibility";

interface BlindDashboardProps extends DashboardViewProps {
  preferences: CommunicationPreferences;
  updatePreferences: (prefs: Partial<CommunicationPreferences>) => Promise<void>;
}

function BlindDashboardView({
  displayName,
  onStartCall,
  onJoinCall,
  roomCodeInput,
  setRoomCodeInput,
  creatingRoom,
  preferences,
  updatePreferences,
}: BlindDashboardProps) {
  const [brailleInput, setBrailleInput] = useState("Hello partner. I am connected.");
  const brailleOutput = useMemo(() => textToBraille(brailleInput), [brailleInput]);

  // Voice announcement helper
  const announceCurrentStatus = useCallback(() => {
    speakText(
      `Welcome to VOXONIX Blind mode, ${displayName}. Press Alt+C to start a 1-to-1 call, Alt+J to join with a code, or Alt+S for settings.`,
    );
  }, [displayName]);

  // Register hotkeys for Blind accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          speakText("Starting new 1-to-1 call.");
          onStartCall();
        } else if (e.key.toLowerCase() === "j") {
          e.preventDefault();
          speakText("Joining call.");
          onJoinCall();
        } else if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          announceCurrentStatus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [announceCurrentStatus, onStartCall, onJoinCall]);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl border border-amber-400 bg-amber-50/80 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-200 text-amber-900">
              <Eye className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Registered Profile · Blind / Low Vision
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">
                Welcome, {displayName}
              </h1>
            </div>
          </div>

          <button
            onClick={announceCurrentStatus}
            className="inline-flex items-center gap-2 rounded-full bg-amber-800 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-amber-900 transition"
          >
            <Volume2 className="h-4 w-4" />
            <span>Read Status (Alt+R)</span>
          </button>
        </div>
        <p className="mt-3 text-sm text-amber-950 max-w-2xl leading-relaxed">
          Screen-reader landmarks, keyboard hotkeys, incoming message audio speech readout (TTS),
          and Unicode Braille generation are active.
        </p>
      </div>

      {/* Call Launch Stage */}
      <CallLauncherSection
        onStartCall={onStartCall}
        onJoinCall={onJoinCall}
        roomCodeInput={roomCodeInput}
        setRoomCodeInput={setRoomCodeInput}
        creatingRoom={creatingRoom}
        badgeText="Voice & Keyboard Hotkeys Active"
      />

      {/* Voice-Guided Hotkeys Reference & Screen Reader Announcer */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-700" />
            <h2 className="font-display text-xl font-bold text-noir">Keyboard Shortcuts</h2>
          </div>
          <p className="text-xs text-noir/65">
            Quickly control calls and navigate without mouse interaction:
          </p>
          <ul className="space-y-2.5 text-xs text-noir/80">
            <li className="flex items-center justify-between border-b border-noir/10 pb-2">
              <span>Start new 1-to-1 Call</span>
              <kbd className="rounded bg-noir/10 px-2 py-1 font-mono font-bold">Alt + C</kbd>
            </li>
            <li className="flex items-center justify-between border-b border-noir/10 pb-2">
              <span>Join call with code</span>
              <kbd className="rounded bg-noir/10 px-2 py-1 font-mono font-bold">Alt + J</kbd>
            </li>
            <li className="flex items-center justify-between border-b border-noir/10 pb-2">
              <span>Repeat dashboard status</span>
              <kbd className="rounded bg-noir/10 px-2 py-1 font-mono font-bold">Alt + R</kbd>
            </li>
            <li className="flex items-center justify-between pb-1">
              <span>Mute / Unmute in call</span>
              <kbd className="rounded bg-noir/10 px-2 py-1 font-mono font-bold">Alt + M</kbd>
            </li>
          </ul>
        </div>

        {/* Braille Output Terminal & Copy Buffer */}
        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Binary className="h-5 w-5 text-amber-700" />
              <h2 className="font-display text-xl font-bold text-noir">
                Braille-Compatible Terminal
              </h2>
            </div>
            <span className="text-xs font-semibold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-full">
              Grade 1 Unicode
            </span>
          </div>
          <p className="text-xs text-noir/65">
            Converts incoming communication into standard 6-dot Unicode Braille (U+2800) for
            refreshable Braille hardware or screen reader buffers.
          </p>

          <div className="rounded-2xl border border-noir/15 bg-background p-4 space-y-2">
            <span className="text-[11px] font-bold uppercase text-noir/50 block">
              Braille Output Preview:
            </span>
            <div className="font-mono text-2xl tracking-widest text-noir font-bold break-all bg-card p-3 rounded-xl border border-noir/10">
              {brailleOutput || "⠀"}
            </div>
            <p className="text-[11px] text-noir/50">Plain text: "{brailleInput}"</p>
          </div>

          <button
            onClick={() => speakText(`Incoming message reads: ${brailleInput}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-noir/20 bg-background px-4 py-2 text-xs font-semibold text-noir hover:bg-noir/5"
          >
            <Volume2 className="h-3.5 w-3.5 text-amber-700" />
            <span>Test Incoming Message Audio Readout</span>
          </button>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. STANDARD USER (HEARING & SPEAKING) DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────────────────

function StandardDashboardView({
  displayName,
  onStartCall,
  onJoinCall,
  roomCodeInput,
  setRoomCodeInput,
  creatingRoom,
}: DashboardViewProps) {
  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-noir/10 text-noir">
            <User className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-noir/60">
              Registered Profile · Normal User (Hearing & Speaking)
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-noir">
              Welcome, {displayName}
            </h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-noir/70 max-w-2xl leading-relaxed">
          Standard audio and video calling is active. When you communicate with Deaf, Non-speaking,
          or Blind partners, VOXONIX automatically adapts your speech and their responses
          seamlessly.
        </p>
      </div>

      {/* Call Launch Stage */}
      <CallLauncherSection
        onStartCall={onStartCall}
        onJoinCall={onJoinCall}
        roomCodeInput={roomCodeInput}
        setRoomCodeInput={setRoomCodeInput}
        creatingRoom={creatingRoom}
        badgeText="Standard WebRTC Video & Audio"
      />

      {/* Diagnostics and Hardware Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-crimson" />
            <h2 className="font-display text-xl font-bold text-noir">Cross-Disability Bridge</h2>
          </div>
          <p className="text-xs text-noir/65 leading-relaxed">
            How VOXONIX adapts your calls for communication partners:
          </p>
          <ul className="space-y-2 text-xs text-noir/80">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>With Deaf partners: Your speech is converted to real-time subtitles.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>
                With Non-speaking partners: You hear their typed phrases spoken via voice.
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>With Blind partners: Clean, clear WebRTC audio optimized for clarity.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-noir/70" />
            <h2 className="font-display text-xl font-bold text-noir">Hardware Readiness</h2>
          </div>
          <p className="text-xs text-noir/65 leading-relaxed">
            Verify that your camera and microphone are properly configured before starting a call:
          </p>
          <div className="pt-2">
            <Link
              to="/media-test"
              className="inline-flex items-center gap-2 rounded-full bg-noir px-5 py-2.5 text-xs font-semibold text-cream hover:bg-crimson transition shadow"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Test Camera & Microphone</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED 1-TO-1 CALL LAUNCHER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function CallLauncherSection({
  onStartCall,
  onJoinCall,
  roomCodeInput,
  setRoomCodeInput,
  creatingRoom,
  badgeText,
}: {
  onStartCall: () => void;
  onJoinCall: (e?: React.FormEvent) => void;
  roomCodeInput: string;
  setRoomCodeInput: (val: string) => void;
  creatingRoom: boolean;
  badgeText?: string;
}) {
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      {/* Start 1-to-1 Call */}
      <div className="group relative overflow-hidden rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-sm transition hover:border-crimson/50 hover:shadow-md">
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson text-cream shadow-md">
              <Plus className="h-6 w-6 stroke-[2.5]" />
            </div>
            {badgeText && (
              <span className="rounded-full bg-crimson/10 px-3 py-1 text-[11px] font-bold text-crimson">
                {badgeText}
              </span>
            )}
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-noir">
            Start 1-to-1 Call
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-noir/65">
            Generate an instant room code and connect with your communication partner.
          </p>
          <button
            onClick={onStartCall}
            disabled={creatingRoom}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-crimson px-7 py-3 text-sm font-semibold text-cream shadow-md transition hover:bg-wine disabled:opacity-60"
          >
            <span>{creatingRoom ? "Connecting…" : "Start Call"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Join Call */}
      <div className="group relative overflow-hidden rounded-3xl border border-noir/15 bg-card p-6 sm:p-8 shadow-sm transition hover:border-noir/30">
        <div className="relative">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-noir/10 text-noir">
            <LogIn className="h-6 w-6 stroke-[2]" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-noir">Join a Call</h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-noir/65">
            Enter a 6-character room code to join an active 1-to-1 call.
          </p>
          <form onSubmit={onJoinCall} className="mt-6 flex gap-2">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. ABC99X"
              className="flex-1 rounded-2xl border border-noir/15 bg-background px-4 py-3 text-sm font-mono uppercase tracking-wider text-noir placeholder:text-noir/35 focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/25"
              maxLength={10}
            />
            <button
              type="submit"
              disabled={!roomCodeInput.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-noir px-6 py-3 text-sm font-semibold text-cream transition hover:bg-crimson disabled:opacity-50"
            >
              <span>Join</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
