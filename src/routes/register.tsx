import { useState, useEffect, useCallback, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { useAuth } from "@/hooks/use-auth";
import { useAccessibility } from "@/hooks/use-accessibility";
import { redirectIfAuthenticated } from "@/lib/auth-helpers";
import { type PrimaryProfile } from "@/lib/capabilities";
import { useBlindVoiceAssistant } from "@/hooks/use-blind-voice-assistant";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  Ear,
  MessageSquare,
  User,
  Volume2,
  Mic,
  RotateCcw,
  HelpCircle,
  Check,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/register")({
  beforeLoad: redirectIfAuthenticated,
  head: () => ({
    meta: [
      { title: "Register — VOXONIX Inclusive Platform" },
      {
        name: "description",
        content:
          "Register for VOXONIX and choose your primary communication mode: Deaf, Non-speaking, Blind, or Standard.",
      },
    ],
  }),
  component: RegisterPage,
});

// ── Validation Schema ─────────────────────────────────────────────────────────

const schema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(64, "Name must be 64 characters or fewer"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    accessibilityProfile: z.enum(["deaf", "non-speaking", "blind", "standard"], {
      errorMap: () => ({ message: "Please choose your communication mode." }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

const FOUR_PROFILES: {
  id: PrimaryProfile;
  label: string;
  badge: string;
  description: string;
  icon: "Ear" | "MessageSquare" | "Eye" | "User";
}[] = [
  {
    id: "deaf",
    label: "Deaf / Hard of Hearing",
    badge: "Visual Communication",
    description:
      "Real-time speech captions, persistent transcript, Indian Sign Language visual guides.",
    icon: "Ear",
  },
  {
    id: "non-speaking",
    label: "Non-speaking",
    badge: "AAC & Synthesized Voice",
    description:
      "Native AAC communication board (50+ phrases), custom phrases, direct call speech synthesis.",
    icon: "MessageSquare",
  },
  {
    id: "blind",
    label: "Blind / Low Vision",
    badge: "Audio & Voice-Guided",
    description:
      "Voice-guided navigation, screen reader first, incoming message speech readout, Braille feed.",
    icon: "Eye",
  },
  {
    id: "standard",
    label: "Hearing & Speaking (Standard)",
    badge: "Standard Audio/Video",
    description:
      "Standard audio and video calling, automatic captions for deaf peers, clear sound.",
    icon: "User",
  },
];

function ProfileIcon({ icon }: { icon: "Ear" | "MessageSquare" | "Eye" | "User" }) {
  switch (icon) {
    case "Ear":
      return <Ear className="h-5 w-5" />;
    case "MessageSquare":
      return <MessageSquare className="h-5 w-5" />;
    case "Eye":
      return <Eye className="h-5 w-5" />;
    case "User":
    default:
      return <User className="h-5 w-5" />;
  }
}

function RegisterPage() {
  const { signUp, isAuthenticated, loading } = useAuth();
  const { setProfile } = useAccessibility();
  const navigate = useNavigate();

  const [selectedProfile, setSelectedProfile] = useState<PrimaryProfile | null>(null);
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [candidateEmail, setCandidateEmail] = useState<string | null>(null);
  const [isProfilesCollapsed, setIsProfilesCollapsed] = useState<boolean>(false);
  const [showVoiceHelp, setShowVoiceHelp] = useState<boolean>(false);

  const {
    isVoiceGuideActive,
    isListening,
    assistantError,
    lastTranscript,
    voiceState,
    hasAudioStream,
    activeTrackCount,
    isSpeechSupported,
    micPermission,
    wakeStatus,
    isLockedOutForSession,
    blindActivationPending,
    clearBlindActivationPending,
    retryWakePermission,
    lockOutBlindForSession,
    selectBlindProfileAndStart,
    disableVoiceGuidance,
    stopVoiceListening,
    speak,
  } = useBlindVoiceAssistant();

  // 5-Step Voice-Guided Registration State Machine
  // 1: Profile, 2: Name, 3: Email, 4: Password, 5: Submit
  const [activeStep, setActiveStep] = useState<number>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>("");
  const lastPwdVoiceSyncRef = useRef<number>(0);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessibilityProfile: "" as unknown as PrimaryProfile,
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  // Converge Path A (spoken "Blind" wake from landing page) into unified Blind registration
  useEffect(() => {
    if (!blindActivationPending) return;
    clearBlindActivationPending();
    if (isLockedOutForSession || (selectedProfile && selectedProfile !== "blind")) {
      return;
    }
    setSelectedProfile("blind");
    setValue("accessibilityProfile", "blind", { shouldValidate: true, shouldDirty: true });
    setIsProfilesCollapsed(true);
    setActiveStep(2);
    setAriaAnnouncement(
      "Blind registration activated. Welcome to VOXONIX. Step 2 of 5: Please spell your first name by saying each letter separately.",
    );
    void selectBlindProfileAndStart("wake");
  }, [
    blindActivationPending,
    clearBlindActivationPending,
    isLockedOutForSession,
    selectedProfile,
    selectBlindProfileAndStart,
    setValue,
  ]);

  // Voice-guided step narration (5 Steps total)
  const triggerStepPrompt = useCallback(
    (step: number) => {
      setActiveStep(step);
      let text = "";
      if (step === 1) {
        text =
          "Step 1 of 5: Choose communication preference. Say 'Blind' or select Blind and Low Vision below.";
      } else if (step === 2) {
        text =
          "Step 2 of 5: Full name. Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname.";
      } else if (step === 3) {
        text =
          "Step 3 of 5: Email address. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
      } else if (step === 4) {
        text =
          "Step 4 of 5: Password creation. Dictate your password in short chunks using capital or small letters, numbers, and symbol names like exclamation mark or underscore. Say next or done when finished. At least 6 characters, or type with your keyboard.";
      } else if (step === 5) {
        text =
          "Step 5 of 5: Review and submit. Say submit to create your account, or click Create Account.";
      }
      setAriaAnnouncement(text);
      if (isVoiceGuideActive && selectedProfile === "blind") {
        speak(text, true);
      }
    },
    [isVoiceGuideActive, selectedProfile, speak],
  );

  // When profile changes, either activate unified Blind flow or lock out Blind voice for non-Blind session
  const handleProfileSelect = useCallback(
    (profile: PrimaryProfile) => {
      setSelectedProfile(profile);
      setValue("accessibilityProfile", profile, { shouldValidate: true, shouldDirty: true });
      if (profile === "blind") {
        setIsProfilesCollapsed(true);
        void selectBlindProfileAndStart("visual");
        setActiveStep(2);
        setAriaAnnouncement(
          "Blind mode selected. Step 2 of 5: Please spell your first name by saying each letter separately.",
        );
      } else {
        setIsProfilesCollapsed(false);
        setCandidateName(null);
        setCandidateEmail(null);
        setActiveStep(1);
        lockOutBlindForSession();
        const label = FOUR_PROFILES.find((p) => p.id === profile)?.label ?? profile;
        setAriaAnnouncement(
          `${label} selected. Blind voice assistance is disabled for this session.`,
        );
      }
    },
    [lockOutBlindForSession, selectBlindProfileAndStart, setValue],
  );

  // Keyboard shortcut Alt+B / CTA for starting or stopping Blind voice guidance
  const handleToggleVoiceGuidance = useCallback(async () => {
    if (isLockedOutForSession || (selectedProfile && selectedProfile !== "blind")) {
      setAriaAnnouncement("Voice guidance is reserved for Blind / Low Vision registration.");
      return;
    }
    if (isVoiceGuideActive) {
      disableVoiceGuidance();
      setAriaAnnouncement("Voice guidance turned off.");
    } else {
      setSelectedProfile("blind");
      setValue("accessibilityProfile", "blind", { shouldValidate: true, shouldDirty: true });
      setIsProfilesCollapsed(true);
      setActiveStep(2);
      await selectBlindProfileAndStart("visual");
      setAriaAnnouncement(
        "Blind voice guidance active. Step 2 of 5: Please spell your first name by saying each letter separately.",
      );
    }
  }, [
    disableVoiceGuidance,
    isLockedOutForSession,
    isVoiceGuideActive,
    selectedProfile,
    selectBlindProfileAndStart,
    setValue,
  ]);

  // Keyboard shortcut listener for Blind accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          void handleToggleVoiceGuidance();
        } else if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          triggerStepPrompt(activeStep);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeStep, handleToggleVoiceGuidance, triggerStepPrompt]);

  const onInvalid = useCallback(
    (formErrors: Partial<Record<keyof FormValues, { message?: string }>>) => {
      if (formErrors.accessibilityProfile) {
        const firstRadio = document.querySelector('button[role="radio"]') as HTMLElement | null;
        firstRadio?.focus();
      } else if (formErrors.displayName) {
        setActiveStep(2);
        document.getElementById("reg-name")?.focus();
      } else if (formErrors.email) {
        setActiveStep(3);
        document.getElementById("reg-email")?.focus();
      } else if (formErrors.password) {
        setActiveStep(4);
        document.getElementById("reg-password")?.focus();
      } else if (formErrors.confirmPassword) {
        setActiveStep(4);
        document.getElementById("reg-confirm-password")?.focus();
      }

      const firstMsg =
        formErrors.accessibilityProfile?.message ||
        formErrors.displayName?.message ||
        formErrors.email?.message ||
        formErrors.password?.message ||
        formErrors.confirmPassword?.message;
      if (firstMsg) {
        setAriaAnnouncement(firstMsg);
        if (isVoiceGuideActive && selectedProfile === "blind") {
          speak(firstMsg, true);
        }
      }
    },
    [isVoiceGuideActive, selectedProfile, speak],
  );

  const onSubmit = useCallback(
    async (data: FormValues) => {
      setServerError(null);

      const { error } = await signUp({
        displayName: data.displayName,
        email: data.email,
        password: data.password,
        accessibilityProfile: data.accessibilityProfile,
      });

      if (error) {
        setServerError(error.message);
        if (isVoiceGuideActive && selectedProfile === "blind") {
          speak(`Registration failed: ${error.message}`, true);
        }
        return;
      }

      stopVoiceListening();
      await setProfile(data.accessibilityProfile);
      if (isVoiceGuideActive && selectedProfile === "blind") {
        speak(
          "Registration successful! Welcome to VOXONIX. Opening your personalized dashboard.",
          true,
        );
      }
      navigate({ to: "/dashboard" });
    },
    [isVoiceGuideActive, navigate, selectedProfile, setProfile, signUp, speak, stopVoiceListening],
  );

  // Auto-advance from Step 4 to Step 5 cleanly when masked passwords match (>= 6 chars)
  const watchedPwd = watch("password");
  const watchedConfirm = watch("confirmPassword");
  useEffect(() => {
    if (
      activeStep === 4 &&
      typeof watchedPwd === "string" &&
      watchedPwd.length >= 6 &&
      watchedPwd === watchedConfirm
    ) {
      setActiveStep(5);
      const step5Msg =
        "Passwords match. Step 5 of 5: Say submit to create your account or click Create Account.";
      setAriaAnnouncement(step5Msg);
      if (
        isVoiceGuideActive &&
        selectedProfile === "blind" &&
        Date.now() - lastPwdVoiceSyncRef.current >= 1500
      ) {
        speak(step5Msg, true);
      }
    }
  }, [activeStep, isVoiceGuideActive, selectedProfile, speak, watchedConfirm, watchedPwd]);

  // Voice assistant conversational listener: feeds form via Controller and handles transitions
  useEffect(() => {
    interface RegisterVoiceEventDetail {
      intent?: string;
      extractedName?: string;
      extractedEmail?: string;
      candidateName?: string;
      candidateEmail?: string;
      extractedPassword?: string;
      extractedConfirmPassword?: string;
      matched?: boolean;
      spokenResponse?: string;
      nextStep?: number;
    }

    const handleVoiceInput = (event: Event) => {
      const customEvent = event as CustomEvent<RegisterVoiceEventDetail>;
      const detail = customEvent.detail;
      if (!detail) return;

      // Strictly block voice-guided registration for locked-out or non-Blind sessions
      if (isLockedOutForSession || (selectedProfile && selectedProfile !== "blind")) {
        return;
      }
      if (detail.intent !== "select_blind" && selectedProfile !== "blind") {
        return;
      }

      if (detail.intent === "repeat") {
        triggerStepPrompt(activeStep);
        return;
      }

      if (detail.intent === "help") {
        setShowVoiceHelp(true);
        setAriaAnnouncement(
          "Voice commands: confirm, repeat, change, go back, start again, help, stop, continue, and submit.",
        );
        return;
      }

      if (detail.intent === "start_again") {
        setCandidateName(null);
        setCandidateEmail(null);
        setValue("displayName", "");
        setValue("email", "");
        setValue("password", "");
        setValue("confirmPassword", "");
        setActiveStep(2);
        setAriaAnnouncement(
          "Restarting Blind registration. Step 2 of 5: Please spell your first name by saying each letter separately.",
        );
        setTimeout(() => {
          document.getElementById("reg-name")?.focus();
        }, 100);
        return;
      }

      if (detail.intent === "continue_step") {
        const next = Math.min(5, activeStep + 1);
        triggerStepPrompt(next);
        return;
      }

      if (detail.intent === "enter_name") {
        setActiveStep(2);
        document.getElementById("reg-name")?.focus();
        return;
      }

      if (detail.intent === "enter_email") {
        setActiveStep(3);
        document.getElementById("reg-email")?.focus();
        return;
      }

      if (detail.intent === "select_blind") {
        setSelectedProfile("blind");
        setValue("accessibilityProfile", "blind", { shouldValidate: true, shouldDirty: true });
        setIsProfilesCollapsed(true);
        setActiveStep(2);
        setAriaAnnouncement(
          "Blind mode selected. Step 2 of 5: Please spell your first name by saying each letter separately.",
        );
        setTimeout(() => {
          document.getElementById("reg-name")?.focus();
        }, 100);
        return;
      }

      // Live spelling preview without triggering candidate confirmation yet
      if (detail.intent === "spelling_name_progress") {
        setCandidateName(null);
        setValue("displayName", detail.extractedName ?? "", { shouldDirty: true });
        setActiveStep(2);
        return;
      }

      if (detail.intent === "spelling_email_progress") {
        setCandidateEmail(null);
        setValue("email", detail.extractedEmail ?? "", { shouldDirty: true });
        setActiveStep(3);
        return;
      }

      // Candidate name displayed for confirmation
      if (detail.intent === "candidate_name" || (detail.candidateName && !detail.extractedName)) {
        const name = detail.candidateName || detail.extractedName;
        if (name) {
          setCandidateName(name);
          setValue("displayName", name, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          setAriaAnnouncement(
            `Candidate name: ${name}. Say confirm, replace first name, replace surname, or restart.`,
          );
          return;
        }
      }

      // Name confirmed or filled directly
      if (detail.extractedName || detail.intent === "fill_name") {
        const name = detail.extractedName;
        if (name) {
          setCandidateName(null);
          setValue("displayName", name, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          setActiveStep(3);
          setAriaAnnouncement(
            `Recorded name as: ${name}. Step 3 of 5: Please spell the part before the at sign by saying each letter separately.`,
          );
          setTimeout(() => {
            document.getElementById("reg-email")?.focus();
          }, 100);
          return;
        }
      }

      // Candidate email displayed for confirmation
      if (
        detail.intent === "candidate_email" ||
        (detail.candidateEmail && !detail.extractedEmail)
      ) {
        const email = detail.candidateEmail || detail.extractedEmail;
        if (email) {
          setCandidateEmail(email);
          setValue("email", email, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          setAriaAnnouncement(
            `Candidate email: ${email}. Say confirm, change username, change domain, or change.`,
          );
          return;
        }
      }

      // Email confirmed or filled directly
      if (detail.extractedEmail || detail.intent === "fill_email") {
        const email = detail.extractedEmail;
        if (email) {
          setCandidateEmail(null);
          setValue("email", email, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          setActiveStep(4);
          setAriaAnnouncement(
            `Recorded email as: ${email}. Step 4 of 5: Dictate your password in short chunks and say next or done when finished.`,
          );
          setTimeout(() => {
            document.getElementById("reg-password")?.focus();
          }, 150);
          return;
        }
      }

      // Reset name / email
      if (detail.intent === "reset_name") {
        setCandidateName(null);
        setValue("displayName", "");
        setActiveStep(2);
        setAriaAnnouncement(
          "Cleared name. Step 2 of 5: Please spell your first name by saying each letter separately.",
        );
        setTimeout(() => {
          document.getElementById("reg-name")?.focus();
        }, 100);
        return;
      }

      if (detail.intent === "reset_email") {
        setCandidateEmail(null);
        setValue("email", "");
        setActiveStep(3);
        setAriaAnnouncement(
          "Cleared email. Step 3 of 5: Please spell the part before the at sign by saying each letter separately.",
        );
        setTimeout(() => {
          document.getElementById("reg-email")?.focus();
        }, 100);
        return;
      }

      // Gnani voice password capture (always stored only in masked password fields, never spoken back)
      if (detail.intent === "fill_voice_password" && typeof detail.extractedPassword === "string") {
        const meetsMinLen = detail.extractedPassword.length >= 6;
        setValue("password", detail.extractedPassword, {
          shouldValidate: meetsMinLen,
          shouldDirty: true,
          shouldTouch: meetsMinLen,
        });
        setValue("confirmPassword", "");
        setActiveStep(4);
        setAriaAnnouncement(
          meetsMinLen
            ? "Password captured in the masked field. Dictate more chunks, or say next or done when finished."
            : "Partial password characters captured into masked field. Continue dictating chunks.",
        );
        return;
      }

      if (detail.intent === "focus_confirm_password") {
        setActiveStep(4);
        setAriaAnnouncement(
          "Password accepted. Step 4 of 5: Dictate your confirm password in short chunks, then say next or done to verify.",
        );
        setTimeout(() => {
          document.getElementById("reg-confirm-password")?.focus();
        }, 100);
        return;
      }

      if (
        detail.intent === "fill_voice_confirm_password" &&
        typeof detail.extractedConfirmPassword === "string"
      ) {
        lastPwdVoiceSyncRef.current = Date.now();
        setValue("confirmPassword", detail.extractedConfirmPassword, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setActiveStep(5);
        setAriaAnnouncement(
          "Passwords match. Step 5 of 5: Say submit to create your account or click Create Account.",
        );
        return;
      }

      if (detail.intent === "reset_passwords") {
        setValue("password", "");
        setValue("confirmPassword", "");
        setActiveStep(4);
        setAriaAnnouncement(
          "Passwords cleared. Step 4 of 5: Dictate your password in short chunks and say next or done when finished.",
        );
        setTimeout(() => {
          document.getElementById("reg-password")?.focus();
        }, 100);
        return;
      }

      if (detail.intent === "submit") {
        void handleSubmit(onSubmit, onInvalid)();
        return;
      }

      if (typeof detail.nextStep === "number" && !detail.extractedName && !detail.extractedEmail) {
        setActiveStep(detail.nextStep);
      }
    };

    const handleProtectedReset = () => {
      if (isLockedOutForSession || (selectedProfile && selectedProfile !== "blind")) return;
      setValue("password", "");
      setValue("confirmPassword", "");
      setActiveStep(4);
      setAriaAnnouncement(
        "Passwords cleared. Step 4 of 5: Dictate your password in short chunks and say next or done when finished.",
      );
      setTimeout(() => {
        document.getElementById("reg-password")?.focus();
      }, 100);
    };

    window.addEventListener("voxonix:voice-input", handleVoiceInput);
    window.addEventListener("voxonix:register-reset-passwords", handleProtectedReset);
    return () => {
      window.removeEventListener("voxonix:voice-input", handleVoiceInput);
      window.removeEventListener("voxonix:register-reset-passwords", handleProtectedReset);
    };
  }, [
    activeStep,
    handleSubmit,
    isLockedOutForSession,
    onInvalid,
    onSubmit,
    selectedProfile,
    setValue,
    triggerStepPrompt,
  ]);

  // Synchronize with spoken "Blind" selection
  useEffect(() => {
    const handleBlindWake = () => {
      if (isLockedOutForSession || (selectedProfile && selectedProfile !== "blind")) return;
      setSelectedProfile("blind");
      setValue("accessibilityProfile", "blind", { shouldValidate: true, shouldDirty: true });
      setIsProfilesCollapsed(true);
      setActiveStep(2);
      setAriaAnnouncement(
        "Blind mode selected. Voice guidance is active. Step 2 of 5: Please spell your first name by saying each letter separately.",
      );
      setTimeout(() => {
        document.getElementById("reg-name")?.focus();
      }, 100);
    };

    window.addEventListener("voxonix:blind-wake", handleBlindWake);
    return () => window.removeEventListener("voxonix:blind-wake", handleBlindWake);
  }, [isLockedOutForSession, selectedProfile, setValue]);

  const isBlindFlow = selectedProfile === "blind" || (isVoiceGuideActive && !selectedProfile);

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* Screen-reader Live Region */}
      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
        {ariaAnnouncement}
      </div>

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
        <span className="hidden text-[11px] uppercase tracking-[0.28em] text-noir/55 sm:block">
          Inclusive Registration
        </span>
        <Link
          to="/login"
          className="rounded-full px-4 py-2 text-sm font-semibold text-noir/80 transition hover:bg-noir/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
        >
          Already registered? Sign In
        </Link>
      </header>

      {/* ── Main Form Area ── */}
      <main id="main-content" className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        {selectedProfile === "blind" &&
          !isVoiceGuideActive &&
          !isLockedOutForSession &&
          (wakeStatus === "permission_denied" ? (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-xs text-amber-950"
            >
              <p className="leading-relaxed">
                <strong>Microphone permission is blocked.</strong> Hands-free Blind voice
                registration needs microphone access and sends short speech segments to Gnani Prisma
                v3.0. Enable Microphone access in your browser site settings and retry, or register
                using a screen reader or keyboard below.
              </p>
              <button
                type="button"
                id="btn-retry-mic-permission"
                onClick={() => void retryWakePermission()}
                className="inline-flex items-center gap-2 rounded-full bg-crimson px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-wine transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry Microphone Permission</span>
              </button>
            </div>
          ) : (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-wine/20 bg-wine/5 px-4 py-3 text-xs">
              <p className="text-noir/80">
                <strong>Blind / Low Vision</strong> voice guidance is paused. Press Alt+B or click
                below to resume hands-free registration (short speech segments are transcribed
                through Gnani Prisma v3.0).
              </p>
              <button
                type="button"
                id="btn-enable-voice-guidance"
                aria-label="Resume Blind Registration by Voice (Shortcut Alt+B)"
                onClick={() => void handleToggleVoiceGuidance()}
                className="inline-flex items-center gap-2 rounded-full bg-wine px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-wine/90 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resume Blind Voice (Alt+B)</span>
              </button>
            </div>
          ))}

        <div
          data-registration-step={activeStep}
          data-selected-profile={selectedProfile || ""}
          className="rounded-3xl border border-noir/15 bg-card p-6 sm:p-10 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]"
        >
          {/* Progress Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-noir/10 pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-crimson">
                Step {activeStep} of 5 ·{" "}
                {activeStep === 1
                  ? "Profile Preference"
                  : activeStep === 2
                    ? "Full Name"
                    : activeStep === 3
                      ? "Email Address"
                      : activeStep === 4
                        ? "Password Dictation"
                        : "Submit Account"}
              </span>
              <h1 className="mt-1 font-display text-3xl sm:text-4xl font-bold text-noir">
                Create Your Account
              </h1>
            </div>

            {isBlindFlow && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-wine/10 text-wine border border-wine/20">
                <Volume2 className="h-3.5 w-3.5" />
                <span>Blind Voice Guide</span>
              </span>
            )}
          </div>

          {/* Focused Voice Instruction Box (One clear instruction for current step) */}
          {isBlindFlow && (
            <div className="mt-6 rounded-2xl border border-wine/20 bg-wine/5 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-noir">
                    {activeStep === 1 && "Choose how you communicate."}
                    {activeStep === 2 && "What is your full name?"}
                    {activeStep === 3 && "What is your email address?"}
                    {activeStep === 4 && "Create your password."}
                    {activeStep === 5 && "Review and submit your account."}
                  </h2>
                  <p className="text-xs text-noir/70 leading-relaxed">
                    {activeStep === 1 &&
                      "Say 'Blind' to select Blind / Low Vision mode, or click your preferred option below."}
                    {activeStep === 2 &&
                      "Spell your first name by saying each letter separately (for example: R, I, S, H, A, N), then say 'done'. Next, spell your surname and say 'done'."}
                    {activeStep === 3 &&
                      "Spell the part before the at sign by saying each letter separately and numbers individually, then say 'at sign' and your email provider."}
                    {activeStep === 4 &&
                      "Dictate your password in short chunks (for example: capital R, small i, number 5, at sign, hash — at least 6 characters), then say 'next' or 'done', or type directly with your keyboard."}
                    {activeStep === 5 &&
                      "All fields are filled! Say 'submit' to review and create your account, or click Create Account."}
                  </p>
                  {(activeStep === 2 || activeStep === 3) && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeStep === 2) {
                            setCandidateName(null);
                            window.dispatchEvent(
                              new CustomEvent("voxonix:request-spelling", {
                                detail: { field: "name" },
                              }),
                            );
                          } else {
                            setCandidateEmail(null);
                            window.dispatchEvent(
                              new CustomEvent("voxonix:request-spelling", {
                                detail: { field: "email" },
                              }),
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-wine/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-wine hover:bg-wine/10 transition"
                      >
                        {activeStep === 2
                          ? 'Restart Name Spelling (Say "Restart")'
                          : 'Restart Email Spelling (Say "Restart")'}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => triggerStepPrompt(activeStep)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-wine border border-wine/20 hover:bg-wine/10 shadow-xs"
                  aria-label="Repeat Instructions (Alt+R)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Repeat (Alt+R)</span>
                </button>
              </div>

              {/* Candidate Name Confirmation Prompt */}
              {activeStep === 2 && candidateName && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold text-sm">
                    I recorded:{" "}
                    <span className="font-bold text-wine">&quot;{candidateName}&quot;</span>. Say
                    &quot;Confirm&quot;, &quot;Replace first name&quot;, &quot;Replace
                    surname&quot;, or &quot;Restart&quot;.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const confirmed = candidateName;
                        setValue("displayName", confirmed, {
                          shouldValidate: true,
                          shouldDirty: true,
                          shouldTouch: true,
                        });
                        setCandidateName(null);
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "spelling_email", confirmedName: confirmed },
                          }),
                        );
                        setActiveStep(3);
                        triggerStepPrompt(3);
                      }}
                      className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
                    >
                      ✓ Yes, Confirm (Say &quot;Confirm&quot;)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCandidateName(null);
                        window.dispatchEvent(
                          new CustomEvent("voxonix:request-spelling", {
                            detail: { field: "name" },
                          }),
                        );
                      }}
                      className="rounded-full bg-wine/10 px-3 py-1.5 text-xs font-semibold text-wine hover:bg-wine/20"
                    >
                      Spell Again (Say &quot;Restart&quot;)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCandidateName(null);
                        setValue("displayName", "");
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "spelling_first_name" },
                          }),
                        );
                        speak(
                          "Cleared name. Please spell your first name by saying each letter separately.",
                          true,
                        );
                      }}
                      className="rounded-full bg-noir/10 px-3 py-1.5 text-xs font-semibold text-noir hover:bg-noir/20"
                    >
                      ✗ No, Change (Say &quot;Change&quot;)
                    </button>
                  </div>
                </div>
              )}

              {/* Candidate Email Confirmation Prompt */}
              {activeStep === 3 && candidateEmail && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold text-sm">
                    I recorded:{" "}
                    <span className="font-bold text-wine">&quot;{candidateEmail}&quot;</span>. Say
                    &quot;Confirm&quot;, &quot;Change username&quot;, &quot;Change domain&quot;, or
                    &quot;Change&quot;.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setValue("email", candidateEmail, {
                          shouldValidate: true,
                          shouldDirty: true,
                          shouldTouch: true,
                        });
                        setCandidateEmail(null);
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "listening_password" },
                          }),
                        );
                        setActiveStep(4);
                        triggerStepPrompt(4);
                      }}
                      className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
                    >
                      ✓ Yes, Confirm (Say &quot;Confirm&quot;)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCandidateEmail(null);
                        window.dispatchEvent(
                          new CustomEvent("voxonix:request-spelling", {
                            detail: { field: "email" },
                          }),
                        );
                      }}
                      className="rounded-full bg-wine/10 px-3 py-1.5 text-xs font-semibold text-wine hover:bg-wine/20"
                    >
                      Spell Again (Say &quot;Spell email&quot;)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCandidateEmail(null);
                        setValue("email", "");
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "spelling_email" },
                          }),
                        );
                        speak(
                          "Cleared email. Please spell the part before the at sign by saying each letter separately.",
                          true,
                        );
                      }}
                      className="rounded-full bg-noir/10 px-3 py-1.5 text-xs font-semibold text-noir hover:bg-noir/20"
                    >
                      ✗ No, Change (Say &quot;Change&quot;)
                    </button>
                  </div>
                </div>
              )}

              {/* Toolbar Actions */}
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-wine/10 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVoiceHelp(!showVoiceHelp)}
                    className="inline-flex items-center gap-1 text-wine hover:underline font-medium"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>{showVoiceHelp ? "Hide Voice Help" : "Voice Help"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-wine/80 italic font-medium">
                  Speech input &amp; spoken guidance powered by Gnani Prisma v3.0 &amp; Timbre v3.0.
                  Captured passwords remain masked and are never spoken aloud.
                </p>
              </div>

              {showVoiceHelp && (
                <div className="mt-2.5 rounded-xl border border-wine/20 bg-white p-3 text-xs space-y-1.5 text-noir/80">
                  <p className="font-semibold text-noir">Blind Registration Voice Commands:</p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li>
                      <strong>Name (Step 2):</strong> Spell your first name letter by letter (e.g.,
                      &quot;R, I, S, H, A, N&quot;), say &quot;done&quot; or &quot;space&quot;, then
                      spell your surname (or &quot;skip&quot;). Supports &quot;replace first
                      name&quot;, &quot;replace surname&quot;, &quot;backspace&quot;,
                      &quot;clear&quot;, and &quot;restart&quot;.
                    </li>
                    <li>
                      <strong>Email (Step 3):</strong> Spell your username letter by letter with
                      individual digits, then say &quot;at sign&quot; and your provider (e.g.,
                      &quot;gmail dot com&quot;). Supports &quot;change username&quot;, &quot;change
                      domain&quot;, &quot;backspace&quot;, &quot;clear&quot;, and &quot;done&quot;.
                    </li>
                    <li>
                      <strong>Password &amp; Confirm Password (Step 4):</strong> Dictate in short
                      chunks (for example &quot;capital R, small i, number 5, at sign, hash&quot;)
                      into the masked field via Gnani Prisma v3.0 (never spoken aloud), then say
                      &quot;next&quot; or &quot;done&quot;, &quot;confirm&quot;, and repeat to
                      verify.
                    </li>
                    <li>
                      <strong>Controls:</strong> Say &quot;confirm&quot;, &quot;repeat&quot;,
                      &quot;change&quot;, &quot;backspace&quot;, &quot;clear&quot;,
                      &quot;done&quot;, &quot;next&quot;, &quot;go back&quot;, &quot;help&quot;,
                      &quot;start again&quot;, &quot;stop&quot;, or &quot;submit&quot;.
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── 1. The 4 Profile Choices (Collapses when Blind is selected) ── */}
          {isBlindFlow && isProfilesCollapsed ? (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-wine/20 bg-wine/5 p-4 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-wine/10 text-wine">
                  <Eye className="h-4 w-4" />
                </span>
                <div>
                  <span className="font-bold text-noir block">Blind / Low Vision</span>
                  <span className="text-[11px] text-wine font-medium">
                    Profile selected · Hands-free voice active
                  </span>
                </div>
              </div>
              <button
                type="button"
                id="btn-voice-registration"
                role="radio"
                aria-checked="true"
                aria-pressed={isVoiceGuideActive ? "true" : "false"}
                className="sr-only"
                aria-label="Blind / Low Vision"
              >
                Blind / Low Vision
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsProfilesCollapsed(false);
                  setActiveStep(1);
                }}
                className="font-semibold text-crimson hover:underline"
              >
                Change profile
              </button>
            </div>
          ) : (
            <Controller
              name="accessibilityProfile"
              control={control}
              render={({ field }) => (
                <fieldset
                  className="mt-6 border-0 p-0 m-0"
                  aria-invalid={!!errors.accessibilityProfile}
                  aria-describedby={
                    errors.accessibilityProfile ? "error-accessibility-profile" : undefined
                  }
                >
                  <legend className="text-sm font-bold text-noir mb-3">
                    Choose how you communicate.
                  </legend>

                  <div
                    id="profile-selection-group"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    role="radiogroup"
                    aria-invalid={!!errors.accessibilityProfile}
                    aria-describedby={
                      errors.accessibilityProfile ? "error-accessibility-profile" : undefined
                    }
                  >
                    {FOUR_PROFILES.map((p) => {
                      const isSelected = field.value === p.id;
                      const isBlind = p.id === "blind";
                      return (
                        <button
                          key={p.id}
                          id={isBlind ? "btn-voice-registration" : undefined}
                          type="button"
                          role="radio"
                          aria-label={
                            isBlind
                              ? isVoiceGuideActive
                                ? "Voice-Guided Registration Active (Shortcut Alt+B to pause)"
                                : "Start Voice-Guided Registration (Shortcut Alt+B)"
                              : p.label
                          }
                          aria-pressed={
                            isBlind ? (isVoiceGuideActive ? "true" : "false") : undefined
                          }
                          aria-checked={isSelected}
                          onClick={() => {
                            field.onChange(p.id);
                            handleProfileSelect(p.id);
                          }}
                          className={`flex flex-col p-4 rounded-2xl border text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson ${
                            isSelected
                              ? "border-crimson bg-crimson/5 ring-2 ring-crimson shadow-sm"
                              : "border-noir/15 bg-background/60 hover:border-noir/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-noir/5 text-noir">
                                <ProfileIcon icon={p.icon} />
                              </span>
                              <div>
                                <span className="text-sm font-bold text-noir block">{p.label}</span>
                                <span className="text-[11px] font-semibold text-crimson">
                                  {p.badge}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="h-5 w-5 rounded-full bg-crimson text-cream flex items-center justify-center text-xs font-bold">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          <p className="mt-2.5 text-xs text-noir/70 leading-relaxed">
                            {p.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {errors.accessibilityProfile && (
                    <p
                      id="error-accessibility-profile"
                      role="alert"
                      aria-live="assertive"
                      className="mt-2 text-xs text-crimson font-medium flex items-center gap-1.5"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{errors.accessibilityProfile.message}</span>
                    </p>
                  )}
                </fieldset>
              )}
            />
          )}

          {/* ── Server Error Notification ── */}
          {serverError && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* ── 2. Registration Input Fields (Screen-Reader-First Accessible Form) ── */}
          <form
            onSubmit={handleSubmit(onSubmit, onInvalid)}
            className="mt-8 space-y-5"
            noValidate
            aria-label="Account Registration Form"
          >
            {/* Display Name */}
            <div>
              <label htmlFor="reg-name" className="block text-sm font-semibold text-noir">
                Full Name{" "}
                <span className="text-crimson" aria-hidden="true">
                  *
                </span>
              </label>
              <Controller
                name="displayName"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    id="reg-name"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Alex Sharma"
                    aria-required="true"
                    aria-invalid={!!errors.displayName}
                    aria-describedby={errors.displayName ? "reg-name-error" : "reg-name-desc"}
                    onFocus={() => {
                      if (isVoiceGuideActive && activeStep !== 2) {
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "spelling_first_name" },
                          }),
                        );
                        triggerStepPrompt(2);
                      }
                    }}
                    className={`mt-1.5 w-full rounded-2xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                      errors.displayName
                        ? "border-crimson focus:border-crimson"
                        : "border-noir/20 focus:border-crimson"
                    }`}
                  />
                )}
              />
              <p id="reg-name-desc" className="sr-only">
                Enter your full name or legal name.
              </p>
              {errors.displayName && (
                <p
                  id="reg-name-error"
                  role="alert"
                  className="mt-1 text-xs text-crimson font-medium"
                >
                  {errors.displayName.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-sm font-semibold text-noir">
                Email Address{" "}
                <span className="text-crimson" aria-hidden="true">
                  *
                </span>
              </label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-required="true"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "reg-email-error" : "reg-email-desc"}
                    onFocus={() => {
                      if (isVoiceGuideActive && activeStep !== 3) {
                        window.dispatchEvent(
                          new CustomEvent("voxonix:sync-reg-phase", {
                            detail: { phase: "spelling_email" },
                          }),
                        );
                        triggerStepPrompt(3);
                      }
                    }}
                    className={`mt-1.5 w-full rounded-2xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                      errors.email
                        ? "border-crimson focus:border-crimson"
                        : "border-noir/20 focus:border-crimson"
                    }`}
                  />
                )}
              />
              <p id="reg-email-desc" className="sr-only">
                Enter your valid email address for account access.
              </p>
              {errors.email && (
                <p
                  id="reg-email-error"
                  role="alert"
                  className="mt-1 text-xs text-crimson font-medium"
                >
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Gnani Voice Password Notice (Blind profile — masked in UI, never spoken back aloud) */}
            {isBlindFlow && (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950 font-medium">
                <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
                <span>
                  Gnani Chunked Password Capture: Dictate your password in short chunks (for
                  example: &quot;capital R, small i, number 5, at sign, hash&quot;), then say
                  &quot;next&quot; or &quot;done&quot;. Passwords are transcribed via Gnani Prisma
                  v3.0 into your masked fields, remain hidden on screen, are never spoken aloud, and
                  are never logged or cached.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-password" className="block text-sm font-semibold text-noir">
                  Password{" "}
                  <span className="text-crimson" aria-hidden="true">
                    *
                  </span>
                </label>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      aria-required="true"
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        errors.password ? "reg-password-error" : "reg-password-desc"
                      }
                      onFocus={() => {
                        if (isVoiceGuideActive && activeStep !== 4) {
                          window.dispatchEvent(
                            new CustomEvent("voxonix:sync-reg-phase", {
                              detail: { phase: "listening_password" },
                            }),
                          );
                          triggerStepPrompt(4);
                        }
                      }}
                      className={`mt-1.5 w-full rounded-2xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                        errors.password
                          ? "border-crimson focus:border-crimson"
                          : "border-noir/20 focus:border-crimson"
                      }`}
                    />
                  )}
                />
                <p id="reg-password-desc" className="sr-only">
                  Password must be at least 6 characters.
                </p>
                {errors.password && (
                  <p
                    id="reg-password-error"
                    role="alert"
                    className="mt-1 text-xs text-crimson font-medium"
                  >
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-confirm-password"
                  className="block text-sm font-semibold text-noir"
                >
                  Confirm Password{" "}
                  <span className="text-crimson" aria-hidden="true">
                    *
                  </span>
                </label>
                <Controller
                  name="confirmPassword"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      id="reg-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      aria-required="true"
                      aria-invalid={!!errors.confirmPassword}
                      aria-describedby={
                        errors.confirmPassword ? "reg-confirm-error" : "reg-confirm-desc"
                      }
                      onFocus={() => {
                        if (isVoiceGuideActive && activeStep !== 4) {
                          window.dispatchEvent(
                            new CustomEvent("voxonix:sync-reg-phase", {
                              detail: { phase: "listening_confirm_password" },
                            }),
                          );
                          triggerStepPrompt(4);
                        }
                      }}
                      className={`mt-1.5 w-full rounded-2xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                        errors.confirmPassword
                          ? "border-crimson focus:border-crimson"
                          : "border-noir/20 focus:border-crimson"
                      }`}
                    />
                  )}
                />
                <p id="reg-confirm-desc" className="sr-only">
                  Re-enter your password to confirm it matches.
                </p>
                {errors.confirmPassword && (
                  <p
                    id="reg-confirm-error"
                    role="alert"
                    className="mt-1 text-xs text-crimson font-medium"
                  >
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                id="btn-submit-register"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-crimson py-3.5 text-base font-semibold text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Creating your account…</span>
                  </>
                ) : (
                  <>
                    <span>Create Account & Open Dashboard</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-noir/10 pt-6 text-center">
            <p className="text-xs text-noir/60">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-crimson hover:underline">
                Sign In here
              </Link>
            </p>
          </div>
        </div>

        {/* ── Development Voice Pipeline Diagnostics Panel (Only shown when ?debug=voice query param is present) ── */}
        {import.meta.env.DEV &&
          typeof window !== "undefined" &&
          window.location.search.includes("debug=voice") && (
            <aside
              aria-label="Voice Pipeline Diagnostics"
              data-testid="voice-pipeline-diagnostics"
              className="mt-6 rounded-2xl border border-dashed border-noir/25 bg-noir/5 p-4 text-xs font-mono text-noir/80"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-noir/10">
                <span className="font-bold text-noir uppercase tracking-wider text-[11px]">
                  Voice Pipeline Diagnostics (Dev Mode)
                </span>
                <span
                  data-testid="diag-voice-state"
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    voiceState === "listening"
                      ? "bg-emerald-100 text-emerald-800"
                      : voiceState === "speaking"
                        ? "bg-blue-100 text-blue-800"
                        : voiceState === "processing"
                          ? "bg-purple-100 text-purple-800"
                          : voiceState === "error" || voiceState === "permission_denied"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                  }`}
                >
                  State: {voiceState}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-noir/50 block text-[10px]">Active Step</span>
                  <span data-testid="diag-active-step" className="font-semibold text-noir">
                    Step {activeStep} of 5
                  </span>
                </div>
                <div>
                  <span className="text-noir/50 block text-[10px]">Mic Permission</span>
                  <span data-testid="diag-mic-permission" className="font-semibold text-noir">
                    {micPermission}
                  </span>
                </div>
                <div>
                  <span className="text-noir/50 block text-[10px]">Audio Stream</span>
                  <span data-testid="diag-audio-stream" className="font-semibold text-noir">
                    {hasAudioStream ? `Live (${activeTrackCount} track)` : "None"}
                  </span>
                </div>
                <div>
                  <span className="text-noir/50 block text-[10px]">Speech Engine</span>
                  <span data-testid="diag-speech-engine" className="font-semibold text-noir">
                    {isSpeechSupported
                      ? isListening
                        ? "Listening (Gnani)"
                        : "Ready"
                      : "Unavailable"}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-noir/10 space-y-1">
                <div>
                  <span className="text-noir/50 text-[10px]">Latest Transcript: </span>
                  <span data-testid="diag-last-transcript" className="font-medium text-noir">
                    {activeStep === 4 ? "•••••••• [Protected Step]" : lastTranscript || "(none)"}
                  </span>
                </div>
                <div>
                  <span className="text-noir/50 text-[10px]">Form Sync: </span>
                  <span data-testid="diag-form-sync" className="font-medium text-noir">
                    {selectedProfile === "blind"
                      ? "Profile: blind ✓"
                      : `Profile: ${selectedProfile}`}{" "}
                    | {watch("displayName") ? `Name: ${watch("displayName")} ✓` : "Name: (empty)"} |{" "}
                    {watch("email") ? `Email: ${watch("email")} ✓` : "Email: (empty)"} |{" "}
                    {watch("password")
                      ? `Password: [Set (${watch("password").length} chars)] ✓`
                      : "Password: (empty)"}
                  </span>
                </div>
                {assistantError && (
                  <div data-testid="diag-error" className="text-crimson font-medium">
                    <span className="text-crimson/70 text-[10px]">Error: </span>
                    {assistantError}
                  </div>
                )}
              </div>
            </aside>
          )}
      </main>
    </div>
  );
}
