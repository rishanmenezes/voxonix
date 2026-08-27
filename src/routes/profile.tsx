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
  ArrowLeft,
  User,
  Mail,
  Calendar,
  Accessibility,
  LogOut,
  Check,
  Eye,
  Ear,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Profile & Communication Mode — VOXONIX" },
      { name: "description", content: "Your Voxonix profile, communication mode, and accessibility preferences." },
    ],
  }),
  component: ProfilePage,
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

function ProfilePage() {
  const { user, signOut } = useAuth();
  const { profile, profileInfo, preferences, setProfile, updatePreferences } = useAccessibility();
  const navigate = useNavigate();

  const [saveSuccess, setSaveSuccess] = useState(false);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";
  const email = user?.email || "";
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleDateString() : "Unknown";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const handleSelectProfile = async (pId: AccessibilityProfile) => {
    await setProfile(pId);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
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
              className="rounded-full px-4 py-2 text-sm font-medium text-crimson transition hover:bg-crimson/10"
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

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-noir/60 transition hover:text-noir"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl text-noir">Your Profile</h1>
            <p className="mt-1 text-sm text-noir/65">
              Account identity, communication mode, and personalized accessibility settings.
            </p>
          </div>
          {saveSuccess && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm animate-in fade-in duration-150">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              <span>Saved to Supabase</span>
            </div>
          )}
        </div>

        {/* Account information card */}
        <div className="mt-8 space-y-6">
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <h2 className="mb-4 font-display text-xl font-bold text-noir">Account Information</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-noir/8">
                  <User className="h-4 w-4 text-noir/70" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-noir/50">Display name</p>
                  <p className="mt-0.5 text-sm font-bold text-noir">{displayName}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-noir/8">
                  <Mail className="h-4 w-4 text-noir/70" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-noir/50">Email</p>
                  <p className="mt-0.5 text-sm font-bold text-noir">{email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-noir/8">
                  <Calendar className="h-4 w-4 text-noir/70" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-noir/50">Account created</p>
                  <p className="mt-0.5 text-sm font-medium text-noir">{createdAt}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Communication Mode Selection */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Accessibility className="h-5 w-5 text-crimson" />
                <h2 className="font-display text-xl font-bold text-noir">Communication Mode</h2>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Supabase Synced</span>
              </div>
            </div>
            <p className="mb-6 text-xs leading-relaxed text-noir/65">
              Select your primary mode to set recommended defaults. You can still customize or override any feature at any time.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_PROFILES_LIST.map((p) => {
                const isSelected = (profile || "standard") === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProfile(p.id)}
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

            {profileInfo && (
              <div className="mt-4 rounded-2xl border border-noir/10 bg-background/50 p-4 text-xs text-noir/75">
                <span className="font-bold text-noir">{profileInfo.label} Focus:</span>{" "}
                {profileInfo.recommendedFocus}
              </div>
            )}
          </div>

          {/* Granular Communication Preferences */}
          <div className="rounded-3xl border border-noir/15 bg-card p-6 shadow-sm">
            <h2 className="mb-2 font-display text-xl font-bold text-noir">Communication Preferences</h2>
            <p className="mb-4 text-xs text-noir/65">
              Fine-tune the multimodal communication bus features for your calls.
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-noir/10 p-3 bg-background/40">
                <div>
                  <p className="font-bold text-noir">Live Closed Captions</p>
                  <p className="text-[10px] text-noir/50">Display speech-to-text subtitles in call room</p>
                </div>
                <button
                  onClick={() => updatePreferences({ captionsEnabled: !preferences.captionsEnabled })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.captionsEnabled ? "bg-noir text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.captionsEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-noir/10 p-3 bg-background/40">
                <div>
                  <p className="font-bold text-noir">Speech Output (TTS)</p>
                  <p className="text-[10px] text-noir/50">Speak incoming captions with acoustic feedback suppression</p>
                </div>
                <button
                  onClick={() => updatePreferences({ speechOutputEnabled: !preferences.speechOutputEnabled })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.speechOutputEnabled ? "bg-wine text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.speechOutputEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-noir/10 p-3 bg-background/40">
                <div>
                  <p className="font-bold text-noir">Sign Language Recognition</p>
                  <p className="text-[10px] text-noir/50">Track ASL gestures with MediaPipe camera stream</p>
                </div>
                <button
                  onClick={() => updatePreferences({ signRecognitionEnabled: !preferences.signRecognitionEnabled })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.signRecognitionEnabled ? "bg-amber-600 text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.signRecognitionEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-noir/10 p-3 bg-background/40">
                <div>
                  <p className="font-bold text-noir">Gesture-Safe Framing</p>
                  <p className="text-[10px] text-noir/50">Preserve full uncropped aspect ratio for signing hands</p>
                </div>
                <button
                  onClick={() => updatePreferences({ gestureSafeFraming: !preferences.gestureSafeFraming })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.gestureSafeFraming ? "bg-emerald-700 text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.gestureSafeFraming ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-noir/10 p-3 bg-background/40">
                <div>
                  <p className="font-bold text-noir">Type to Speak</p>
                  <p className="text-[10px] text-noir/50">Display quick keyboard speech drawer</p>
                </div>
                <button
                  onClick={() => updatePreferences({ typeToSpeakEnabled: !preferences.typeToSpeakEnabled })}
                  className={`rounded-full px-3 py-1 font-bold transition ${
                    preferences.typeToSpeakEnabled ? "bg-crimson text-cream" : "bg-noir/10 text-noir/60"
                  }`}
                >
                  {preferences.typeToSpeakEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
