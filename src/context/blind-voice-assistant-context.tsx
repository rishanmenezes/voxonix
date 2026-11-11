import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_BLIND_VOICE_PREFERENCES,
  LOUD_VOICE_RMS_THRESHOLD,
  WakeUtteranceSegmenter,
  encodeFloat32ToPcm16Base64,
  hashAudioSamples,
  isWakeWordBlind,
  normalizeQuietUtteranceAudio,
  type BlindVoicePreferences,
  type OnboardingState,
  type PendingConfirmationState,
  type SegmenterFrameOptions,
  type VoiceState,
  type WakeStatus,
} from "@/lib/accessibility/blind-voice-wake";
import {
  createLocalAudioCapturePipeline,
  type LocalAudioCaptureHandle,
} from "@/lib/accessibility/local-audio-capture";
import { BlindVoiceAssistantContext } from "@/hooks/use-blind-voice-assistant";
import {
  extractSpokenName,
  formatEmailBufferForReadback,
  formatEmailForReadback,
  formatNameForReadback,
  formatSpelledLettersForTts,
  isAffirmativePhrase,
  isEmailSpellingTrigger,
  isNegativePhrase,
  isOnboardingRegisterChoice,
  isOnboardingSignInChoice,
  isSpellingBackspaceTrigger,
  isSpellingClearTrigger,
  isSpellingContinueTrigger,
  isSpellingDoneTrigger,
  isSpellingNextChunkOrDoneTrigger,
  isSpellingNextTrigger,
  isSpellingRepeatLetterTrigger,
  isSpellingSkipTrigger,
  isSpellingTrigger,
  normalizeSpokenEmail,
  parseSpelledEmailChunk,
  parseSpelledName,
  parseSpelledPassword,
  parseSpelledWordLetters,
} from "@/lib/accessibility/registration-voice-extractor";
import { interpretVoiceCommand } from "@/lib/accessibility/command-interpreter";
import {
  GNANI_TTS_UNAVAILABLE_MESSAGE,
  getSharedGnaniTtsProvider,
} from "@/lib/tts/gnani-tts-provider";

const PREF_STORAGE_KEY = "voxonix_blind_voice_preferences";
const VOICE_ENABLED_STORAGE_KEY = "voxonix_voice_assistant_enabled";

function loadSavedPreferences(): BlindVoicePreferences {
  if (typeof window === "undefined") return DEFAULT_BLIND_VOICE_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_BLIND_VOICE_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<BlindVoicePreferences>;
    return { ...DEFAULT_BLIND_VOICE_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_BLIND_VOICE_PREFERENCES;
  }
}

function isPasswordFieldFocused(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) return false;
  return active.type === "password";
}

function summarizeCurrentPageText(): string {
  if (typeof document === "undefined") return "Current page content is unavailable.";
  const main = document.querySelector("main") || document.body;
  const heading = main.querySelector("h1, h2")?.textContent?.trim();
  const paragraphs = Array.from(main.querySelectorAll("p, h2, h3"))
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => Boolean(t && t.length > 4))
    .slice(0, 3);
  const parts = [heading ? `Page heading: ${heading}.` : "", ...paragraphs].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "VOXONIX accessible page ready.";
}

function readFocusedFieldSummary(): string {
  if (typeof document === "undefined") return "No field is currently focused.";
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    const label =
      labelEl?.textContent?.replace(/\*/g, "").trim() ||
      el.getAttribute("aria-label") ||
      el.id ||
      "input field";
    if (el instanceof HTMLInputElement && el.type === "password") {
      const len = el.value.length;
      return `${label}. Masked password field containing ${len} characters. Passwords are never spoken aloud.`;
    }
    const val = el.value.trim();
    return val ? `${label}. Current value: ${val}.` : `${label}. Currently empty.`;
  }
  return "No form field is currently focused.";
}

function getRegisterDomSelectedProfile(): string | null {
  if (typeof document === "undefined") return null;
  const val = document
    .querySelector("[data-selected-profile]")
    ?.getAttribute("data-selected-profile");
  return val ? val.trim() : null;
}

function formatTitleWord(rawWord: string): string {
  return rawWord ? rawWord.charAt(0).toUpperCase() + rawWord.slice(1).toLowerCase() : "";
}

function formatMultiWordTitle(rawText: string): string {
  return rawText.trim().split(/\s+/).filter(Boolean).map(formatTitleWord).join(" ");
}

type RegistrationFieldPhase =
  | "idle"
  | "listening_name"
  | "spelling_first_name"
  | "spelling_surname"
  | "confirming_name"
  | "listening_email"
  | "spelling_email"
  | "confirming_email"
  | "listening_password"
  | "confirming_password"
  | "listening_confirm_password"
  | "confirming_submit";

type LoginFieldPhase =
  | "idle"
  | "listening_login_email"
  | "spelling_login_email"
  | "confirming_login_email"
  | "listening_login_password"
  | "confirming_login_submit"
  | "submitting_login";

const REGISTER_PROTECTED_RESET_EVENT = "voxonix:register-reset-passwords";
const LOGIN_PROTECTED_RESET_EVENT = "voxonix:login-clear-password";
const MAX_LOGIN_CONFIRM_REPROMPTS = 1;
const LOGIN_CONFIRM_INACTIVITY_MS = 20_000;
const LOGIN_SUCCESS_TTS_TIMEOUT_MS = 8_500;
const LOGIN_SUCCESS_ANNOUNCEMENT =
  "Sign in successful. Welcome to VOXONIX. Your dashboard is opening now.";
const LOGIN_CONFIRM_HELP_TEXT =
  "Available commands: say sign in to submit, add more to append password characters, change password, change email, change username, change domain, go back, repeat, or cancel.";

function normalizeLoginCommandText(rawText: string): string {
  return rawText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnambiguousLoginSubmitCommand(rawText: string): boolean {
  const normalized = normalizeLoginCommandText(rawText);
  if (!normalized) return false;
  if (/\b(?:not|dont|don t|do not|never|no|cancel|stop|wait|hold)\b/.test(normalized)) {
    return false;
  }
  if (
    /\b(?:add|more|change|edit|clear|reset|reenter|re enter|redo|back|password|email|username|domain|repeat|help)\b/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /^(?:(?:please|ok|okay|yes|yeah|yep|alright)\s+)?(?:sign\s*in(?:\s+(?:now|please|to\s+my\s+account))?|signin(?:\s+(?:now|please))?|log\s*in(?:\s+(?:now|please|to\s+my\s+account))?|login(?:\s+(?:now|please))?|log\s+me\s+in(?:\s+(?:now|please))?|sign\s+me\s+in(?:\s+(?:now|please))?|submit(?:\s+(?:login|sign\s*in|(?:the\s+)?form))?(?:\s+(?:now|please))?)$/.test(
    normalized,
  );
}

const ONBOARDING_CHOICE_KEYTERMS = [
  "register",
  "registration",
  "sign up",
  "create account",
  "new account",
  "sign in",
  "login",
  "log in",
  "existing account",
  "repeat",
  "stop",
  "cancel",
];

const EMAIL_SPELLING_KEYTERMS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "eff",
  "ell",
  "em",
  "en",
  "enn",
  "ess",
  "aitch",
  "haitch",
  "cue",
  "double you",
  "wye",
  "zed",
  "zee",
  "the letter",
  "letter",
  "repeat letter",
  "clear last letter",
  "continue",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "number",
  "at",
  "at sign",
  "at the rate",
  "dot",
  "point",
  "underscore",
  "hyphen",
  "dash",
  "minus",
  "plus",
  "gmail",
  "yahoo",
  "outlook",
  "hotmail",
  "protonmail",
  "icloud",
  "live",
  "com",
  "in",
  "co",
  "org",
  "edu",
  "net",
  "io",
  "done",
  "next",
  "backspace",
  "delete",
  "clear",
  "confirm",
  "change",
  "change username",
  "change domain",
  "repeat",
  "help",
  "go back",
  "start again",
  "stop",
];

const ALPHABET_SPELLING_KEYTERMS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "ay",
  "bee",
  "see",
  "dee",
  "ee",
  "eff",
  "gee",
  "aitch",
  "haitch",
  "eye",
  "jay",
  "kay",
  "ell",
  "em",
  "en",
  "enn",
  "oh",
  "pee",
  "cue",
  "queue",
  "are",
  "ess",
  "tee",
  "you",
  "vee",
  "double you",
  "ex",
  "why",
  "wye",
  "zee",
  "zed",
  "the letter",
  "letter",
  "the letter N",
  "letter N",
  "space",
  "next",
  "next word",
  "surname",
  "done",
  "continue",
  "repeat letter",
  "clear last letter",
  "backspace",
  "delete",
  "clear",
  "skip",
  "cancel",
  "confirm",
  "replace first name",
  "replace surname",
  "restart",
  "change",
  "repeat",
  "help",
];

export function BlindVoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { profile, setProfile } = useAccessibility();
  const { isAuthenticated, user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState<boolean>(false);
  const [isVoiceGuideActive, setIsVoiceGuideActive] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [wakeStatus, setWakeStatus] = useState<WakeStatus>("idle");
  const [onboardingState, setOnboardingState] = useState<OnboardingState>("idle");
  const [isLockedOutForSession, setIsLockedOutForSession] = useState<boolean>(false);
  const [blindActivationPending, setBlindActivationPending] = useState<boolean>(false);
  const [blindLoginPending, setBlindLoginPending] = useState<boolean>(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [isLoudEnough, setIsLoudEnough] = useState<boolean>(false);
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [voicePreferences, setVoicePreferences] = useState<BlindVoicePreferences>(
    DEFAULT_BLIND_VOICE_PREFERENCES,
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("disabled");
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt" | "unknown">(
    "unknown",
  );
  const [hasAudioStream, setHasAudioStream] = useState<boolean>(false);
  const [activeTrackCount, setActiveTrackCount] = useState<number>(0);
  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean>(true);
  const [gnaniAvailable, setGnaniAvailable] = useState<boolean>(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationState | null>(
    null,
  );

  const captureHandleRef = useRef<LocalAudioCaptureHandle | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const segmenterRef = useRef<WakeUtteranceSegmenter>(new WakeUtteranceSegmenter());
  const isStartingPipelineRef = useRef<boolean>(false);
  const isManuallyPausedRef = useRef<boolean>(false);
  const isDeactivatedForNonBlindRef = useRef<boolean>(false);
  const isLockedOutForSessionRef = useRef<boolean>(false);
  const wakeModeRef = useRef<boolean>(false);
  const onboardingStateRef = useRef<OnboardingState>("idle");
  const onboardingCycleTokenRef = useRef<number>(0);
  const blindLoginPendingRef = useRef<boolean>(false);
  const hasAttemptedAutoMicRef = useRef<boolean>(false);
  const sttAbortControllerRef = useRef<AbortController | null>(null);
  const lastWakeSttAtRef = useRef<number>(0);

  const isSpeakingRef = useRef<boolean>(false);
  const ttsEndedAtRef = useRef<number>(0);
  const activeSpeakIdRef = useRef<number>(0);
  const isSttInFlightRef = useRef<boolean>(false);
  const lastSttSubmissionRef = useRef<{ hash: string; contextKey: string; at: number } | null>(
    null,
  );
  const sttSkippedOrDeduplicatedCountRef = useRef<number>(0);
  const lastVolumeUiUpdateRef = useRef<number>(0);
  const lastQuantizedVolumeRef = useRef<number>(0);

  const isVoiceGuideActiveRef = useRef<boolean>(isVoiceGuideActive);
  const isListeningRef = useRef<boolean>(isListening);
  const isPausedRef = useRef<boolean>(isPaused);
  const voiceGuidanceEnabledRef = useRef<boolean>(voiceGuidanceEnabled);
  const voiceStateRef = useRef<VoiceState>(voiceState);
  const profileRef = useRef(profile);
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);
  const authProfileRef = useRef<unknown>(user?.user_metadata?.accessibility_profile);
  const micPermissionRef = useRef(micPermission);
  const pathnameRef = useRef<string>(location.pathname);
  const prevEffectPathnameRef = useRef<string | null>(null);

  const pendingNameCandidateRef = useRef<string | null>(null);
  const pendingEmailCandidateRef = useRef<string | null>(null);
  const pendingPasswordCandidateRef = useRef<string | null>(null);
  const confirmedNameRef = useRef<string | null>(null);
  const spelledFirstNameBufferRef = useRef<string>("");
  const spelledSurnameBufferRef = useRef<string>("");
  const spelledEmailBufferRef = useRef<string>("");
  const preservedEmailLocalRef = useRef<string>("");
  const preservedEmailDomainRef = useRef<string>("");
  const passwordDraftBufferRef = useRef<string>("");
  const confirmPasswordDraftBufferRef = useRef<string>("");
  const regFieldPhaseRef = useRef<RegistrationFieldPhase>("idle");
  const pendingLastLetterRetryRef = useRef<"first_name" | "surname" | "email" | null>(null);
  const loginFieldPhaseRef = useRef<LoginFieldPhase>("idle");
  const pendingLoginEmailRef = useRef<string | null>(null);
  const confirmedLoginEmailRef = useRef<string | null>(null);
  const spelledLoginEmailBufferRef = useRef<string>("");
  const loginPasswordDraftRef = useRef<string>("");
  const isSubmittingLoginRef = useRef<boolean>(false);
  const loginConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginConfirmRepromptCountRef = useRef<number>(0);
  const loginConfirmWindowGenRef = useRef<number>(0);
  const isCompletingLoginSuccessRef = useRef<boolean>(false);
  const loginSuccessPromiseRef = useRef<Promise<void> | null>(null);
  const pendingConfirmationRef = useRef<PendingConfirmationState | null>(null);
  const lastSpokenTextRef = useRef<string | null>(null);

  const clearLoginConfirmTimer = useCallback(() => {
    loginConfirmWindowGenRef.current++;
    if (loginConfirmTimerRef.current !== null) {
      clearTimeout(loginConfirmTimerRef.current);
      loginConfirmTimerRef.current = null;
    }
  }, []);

  const clearAllRegistrationBuffers = useCallback(() => {
    pendingNameCandidateRef.current = null;
    pendingEmailCandidateRef.current = null;
    pendingPasswordCandidateRef.current = null;
    confirmedNameRef.current = null;
    spelledFirstNameBufferRef.current = "";
    spelledSurnameBufferRef.current = "";
    pendingLastLetterRetryRef.current = null;
    spelledEmailBufferRef.current = "";
    preservedEmailLocalRef.current = "";
    preservedEmailDomainRef.current = "";
    passwordDraftBufferRef.current = "";
    confirmPasswordDraftBufferRef.current = "";
    pendingConfirmationRef.current = null;
    setPendingConfirmation(null);
  }, []);

  const clearAllLoginBuffers = useCallback(
    (preserveConfirmedEmail = false) => {
      clearLoginConfirmTimer();
      loginConfirmRepromptCountRef.current = 0;
      pendingLoginEmailRef.current = null;
      if (!preserveConfirmedEmail) {
        confirmedLoginEmailRef.current = null;
      }
      spelledLoginEmailBufferRef.current = "";
      pendingLastLetterRetryRef.current = null;
      preservedEmailLocalRef.current = "";
      preservedEmailDomainRef.current = "";
      loginPasswordDraftRef.current = "";
      isSubmittingLoginRef.current = false;
      isCompletingLoginSuccessRef.current = false;
      loginSuccessPromiseRef.current = null;
    },
    [clearLoginConfirmTimer],
  );

  const setSyncOnboardingState = useCallback((next: OnboardingState) => {
    onboardingStateRef.current = next;
    setOnboardingState(next);
  }, []);

  const getDynamicSegmenterOptions = useCallback((): SegmenterFrameOptions => {
    if (
      wakeModeRef.current ||
      (!isVoiceGuideActiveRef.current && onboardingStateRef.current !== "awaiting_auth_intent")
    ) {
      return { activeMode: false, silenceHangMs: 450, maxUtteranceMs: 4000 };
    }
    if (onboardingStateRef.current === "awaiting_auth_intent" && pathnameRef.current === "/") {
      return { activeMode: true, silenceHangMs: 680, maxUtteranceMs: 8000 };
    }
    if (pathnameRef.current === "/login") {
      const loginPhase = loginFieldPhaseRef.current;
      if (loginPhase === "spelling_login_email") {
        return { activeMode: true, silenceHangMs: 1350, maxUtteranceMs: 18000 };
      }
      if (loginPhase === "listening_login_password") {
        return { activeMode: true, silenceHangMs: 1350, maxUtteranceMs: 20000 };
      }
      if (loginPhase === "listening_login_email") {
        return { activeMode: true, silenceHangMs: 1050, maxUtteranceMs: 16000 };
      }
      return { activeMode: true, silenceHangMs: 680, maxUtteranceMs: 8000 };
    }
    const phase = regFieldPhaseRef.current;
    if (
      phase === "spelling_first_name" ||
      phase === "spelling_surname" ||
      phase === "spelling_email"
    ) {
      return { activeMode: true, silenceHangMs: 1350, maxUtteranceMs: 18000 };
    }
    if (phase === "listening_password" || phase === "listening_confirm_password") {
      return { activeMode: true, silenceHangMs: 1350, maxUtteranceMs: 20000 };
    }
    if (phase === "listening_email") {
      return { activeMode: true, silenceHangMs: 1050, maxUtteranceMs: 16000 };
    }
    if (phase === "listening_name") {
      return { activeMode: true, silenceHangMs: 850, maxUtteranceMs: 12000 };
    }
    return { activeMode: true, silenceHangMs: 680, maxUtteranceMs: 8000 };
  }, []);

  const handleRecognizedTranscriptRef = useRef<(t: string) => Promise<void>>(async () => {});
  const startVoiceListeningRef = useRef<
    (userInitiated?: boolean, wakeOnly?: boolean) => Promise<boolean>
  >(async () => false);
  const stopAudioPipelineRef = useRef<(nextState: VoiceState) => void>(() => {});
  const selectBlindProfileRef = useRef<(source?: "wake" | "visual") => Promise<void>>(
    async () => {},
  );

  isVoiceGuideActiveRef.current = isVoiceGuideActive;
  isListeningRef.current = isListening;
  isPausedRef.current = isPaused;
  voiceGuidanceEnabledRef.current = voiceGuidanceEnabled;
  voiceStateRef.current = voiceState;
  profileRef.current = profile;
  isAuthenticatedRef.current = isAuthenticated;
  authProfileRef.current = user?.user_metadata?.accessibility_profile;
  micPermissionRef.current = micPermission;
  pathnameRef.current = location.pathname;
  pendingConfirmationRef.current = pendingConfirmation;
  lastSpokenTextRef.current = lastSpokenText;

  const isUserEligibleForBlindVoice = useCallback((): boolean => {
    const currentPath = pathnameRef.current || "/";

    if (isAuthenticatedRef.current) {
      return authProfileRef.current === "blind";
    }

    if (isLockedOutForSessionRef.current) {
      return false;
    }

    if (currentPath === "/" && onboardingStateRef.current === "awaiting_auth_intent") {
      return true;
    }

    if (currentPath === "/register") {
      const domProfile = getRegisterDomSelectedProfile();
      return !domProfile || domProfile === "blind";
    }

    if (currentPath === "/login") {
      return true;
    }

    return false;
  }, []);

  const updateVoicePreferences = useCallback((partial: Partial<BlindVoicePreferences>) => {
    setVoicePreferences((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const syncPostSpeechVoiceState = useCallback(() => {
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    ttsEndedAtRef.current = Date.now();
    segmenterRef.current.reset();
    if (isListeningRef.current && hasLiveAudioTrack(micStreamRef.current)) {
      setVoiceState("listening");
    } else if (isPausedRef.current) {
      setVoiceState("paused");
    } else {
      setVoiceState("disabled");
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    activeSpeakIdRef.current++;
    getSharedGnaniTtsProvider().cancel();
    syncPostSpeechVoiceState();
  }, [syncPostSpeechVoiceState]);

  /**
   * Speaks responses exclusively through Gnani Timbre v3.0 (`/api/ai/gnani/tts`).
   * Never silently falls back to `window.speechSynthesis`; displays text + error when unavailable.
   */
  const speak = useCallback(
    (text: string, force = false, onFinished?: () => void) => {
      if (typeof window === "undefined") return;
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!isVoiceGuideActiveRef.current && !force) return;
      const isInOnboardingPrompt =
        onboardingStateRef.current === "wake_detected" ||
        onboardingStateRef.current === "awaiting_auth_intent";
      if (
        !isVoiceGuideActiveRef.current &&
        !isInOnboardingPrompt &&
        profileRef.current &&
        profileRef.current !== "blind"
      ) {
        return;
      }
      if (isDeactivatedForNonBlindRef.current) return;

      const speakId = ++activeSpeakIdRef.current;
      setLastSpokenText(trimmed);
      lastSpokenTextRef.current = trimmed;
      setTtsError(null);
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      segmenterRef.current.reset();
      setVoiceState("speaking");

      void getSharedGnaniTtsProvider()
        .speakText(trimmed, {
          voice: voicePreferences.voiceURI || "Shivani",
          language: voicePreferences.language || "en-IN",
          speed: voicePreferences.rate,
          volume: voicePreferences.volume,
        })
        .then(() => {
          if (activeSpeakIdRef.current === speakId) {
            syncPostSpeechVoiceState();
            onFinished?.();
          }
        })
        .catch(() => {
          if (activeSpeakIdRef.current === speakId) {
            setTtsError(GNANI_TTS_UNAVAILABLE_MESSAGE);
            syncPostSpeechVoiceState();
            onFinished?.();
          }
        });
    },
    [syncPostSpeechVoiceState, voicePreferences],
  );

  const repeatLastSpoken = useCallback(() => {
    const prev = lastSpokenTextRef.current;
    if (prev) {
      speak(prev, true);
    } else {
      speak(summarizeCurrentPageText(), true);
    }
  }, [speak]);

  const abortInFlightStt = useCallback(() => {
    if (sttAbortControllerRef.current) {
      sttAbortControllerRef.current.abort();
      sttAbortControllerRef.current = null;
    }
    isSttInFlightRef.current = false;
  }, []);

  const stopAudioPipeline = useCallback(
    (nextState: VoiceState) => {
      isStartingPipelineRef.current = false;
      wakeModeRef.current = false;
      abortInFlightStt();
      segmenterRef.current.reset();
      lastSttSubmissionRef.current = null;

      if (captureHandleRef.current) {
        const handle = captureHandleRef.current;
        captureHandleRef.current = null;
        void handle.dispose();
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        micStreamRef.current = null;
      }

      setHasAudioStream(false);
      setActiveTrackCount(0);
      setVolumeLevel(0);
      setIsLoudEnough(false);
      setIsListening(false);
      isListeningRef.current = false;
      setVoiceState(nextState);
    },
    [abortInFlightStt],
  );

  stopAudioPipelineRef.current = stopAudioPipeline;

  const stopVoiceListening = useCallback(() => {
    stopAudioPipeline("disabled");
  }, [stopAudioPipeline]);

  const clearBlindActivationPending = useCallback(() => {
    setBlindActivationPending(false);
  }, []);

  const clearBlindLoginPending = useCallback(() => {
    blindLoginPendingRef.current = false;
    setBlindLoginPending(false);
  }, []);

  const selectBlindProfileAndStart = useCallback(
    async (source: "wake" | "visual" = "visual") => {
      // Stop any wake/onboarding listener & invalidate in-flight choice callbacks before transitioning
      onboardingCycleTokenRef.current++;
      const needsRouteTransition = pathnameRef.current !== "/register";
      wakeModeRef.current = false;
      setSyncOnboardingState(needsRouteTransition ? "transitioning_register" : "idle");
      blindLoginPendingRef.current = false;
      setBlindLoginPending(false);
      abortInFlightStt();
      segmenterRef.current.reset();
      lastSttSubmissionRef.current = null;
      setWakeStatus("idle");

      if (needsRouteTransition) {
        cancelSpeech();
        stopAudioPipeline("disabled");
      }

      isLockedOutForSessionRef.current = false;
      setIsLockedOutForSession(false);
      isDeactivatedForNonBlindRef.current = false;
      isManuallyPausedRef.current = false;
      setIsPaused(false);
      isPausedRef.current = false;
      setAssistantError(null);
      setTtsError(null);
      setLastTranscript(null);

      clearAllLoginBuffers();
      loginFieldPhaseRef.current = "idle";
      clearAllRegistrationBuffers();
      regFieldPhaseRef.current = "spelling_first_name";

      setIsVoiceGuideActive(true);
      isVoiceGuideActiveRef.current = true;
      setVoiceGuidanceEnabled(true);
      voiceGuidanceEnabledRef.current = true;

      if (!isAuthenticatedRef.current) {
        try {
          await setProfile("blind");
        } catch {
          // ignore storage write errors
        }
      }

      if (needsRouteTransition) {
        setBlindActivationPending(true);
        navigate({ to: "/register" });
        return;
      }

      const started = await startVoiceListeningRef.current(true, false);
      const welcome =
        source === "wake"
          ? "Blind registration activated. Welcome to VOXONIX. Step 2 of 5: Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname."
          : "Blind and Low Vision mode selected. Step 2 of 5: Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname.";
      speak(welcome, true);
      window.dispatchEvent(
        new CustomEvent("voxonix:voice-input", {
          detail: { intent: "select_blind", spokenResponse: welcome, nextStep: 2 },
        }),
      );
      if (!started && micPermissionRef.current === "denied") {
        setWakeStatus("permission_denied");
      }
    },
    [
      abortInFlightStt,
      cancelSpeech,
      clearAllLoginBuffers,
      clearAllRegistrationBuffers,
      navigate,
      setProfile,
      setSyncOnboardingState,
      speak,
      stopAudioPipeline,
    ],
  );

  selectBlindProfileRef.current = selectBlindProfileAndStart;

  const startBlindVoiceLogin = useCallback(async () => {
    // Stop any wake/onboarding listener & release queued choice audio before navigating
    onboardingCycleTokenRef.current++;
    const needsRouteTransition = pathnameRef.current !== "/login";
    wakeModeRef.current = false;
    setSyncOnboardingState(needsRouteTransition ? "transitioning_login" : "idle");
    setBlindActivationPending(false);
    abortInFlightStt();
    segmenterRef.current.reset();
    lastSttSubmissionRef.current = null;
    setWakeStatus("idle");

    if (needsRouteTransition) {
      cancelSpeech();
      stopAudioPipeline("disabled");
    }

    isLockedOutForSessionRef.current = false;
    setIsLockedOutForSession(false);
    isDeactivatedForNonBlindRef.current = false;
    isManuallyPausedRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setAssistantError(null);
    setTtsError(null);
    setLastTranscript(null);

    clearAllRegistrationBuffers();
    regFieldPhaseRef.current = "idle";
    clearAllLoginBuffers();
    loginFieldPhaseRef.current = "spelling_login_email";

    setIsVoiceGuideActive(true);
    isVoiceGuideActiveRef.current = true;
    setVoiceGuidanceEnabled(true);
    voiceGuidanceEnabledRef.current = true;

    if (!isAuthenticatedRef.current) {
      try {
        await setProfile("blind");
      } catch {
        // ignore storage write errors
      }
    }

    if (needsRouteTransition) {
      blindLoginPendingRef.current = true;
      setBlindLoginPending(true);
      navigate({ to: "/login" });
      return;
    }

    blindLoginPendingRef.current = false;
    setBlindLoginPending(false);

    const started = await startVoiceListeningRef.current(true, false);
    const welcome =
      "Let's sign in to your VOXONIX account. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
    speak(welcome, true);
    if (!started && micPermissionRef.current === "denied") {
      setWakeStatus("permission_denied");
    }
  }, [
    abortInFlightStt,
    cancelSpeech,
    clearAllLoginBuffers,
    clearAllRegistrationBuffers,
    navigate,
    setProfile,
    setSyncOnboardingState,
    speak,
    stopAudioPipeline,
  ]);

  const scheduleLoginConfirmWindow = useCallback(
    (expectedGen: number) => {
      if (loginConfirmTimerRef.current !== null) {
        clearTimeout(loginConfirmTimerRef.current);
        loginConfirmTimerRef.current = null;
      }
      loginConfirmTimerRef.current = setTimeout(() => {
        loginConfirmTimerRef.current = null;
        if (
          loginConfirmWindowGenRef.current !== expectedGen ||
          pathnameRef.current !== "/login" ||
          !isVoiceGuideActiveRef.current ||
          isAuthenticatedRef.current ||
          isPausedRef.current ||
          isLockedOutForSessionRef.current ||
          isDeactivatedForNonBlindRef.current ||
          isSubmittingLoginRef.current ||
          isCompletingLoginSuccessRef.current ||
          loginFieldPhaseRef.current !== "confirming_login_submit"
        ) {
          return;
        }

        // Never interrupt active TTS playback or an in-flight Gnani STT request
        if (isSpeakingRef.current || isSttInFlightRef.current) {
          scheduleLoginConfirmWindow(expectedGen);
          return;
        }

        if (loginConfirmRepromptCountRef.current < MAX_LOGIN_CONFIRM_REPROMPTS) {
          loginConfirmRepromptCountRef.current += 1;
          const retryGen = ++loginConfirmWindowGenRef.current;
          speak(
            "Ready to sign in. Say sign in to continue, add more to append characters, or change password to enter it again.",
            true,
            () => {
              if (
                loginConfirmWindowGenRef.current === retryGen &&
                pathnameRef.current === "/login" &&
                isVoiceGuideActiveRef.current &&
                !isAuthenticatedRef.current &&
                !isPausedRef.current &&
                !isLockedOutForSessionRef.current &&
                !isDeactivatedForNonBlindRef.current &&
                !isSubmittingLoginRef.current &&
                !isCompletingLoginSuccessRef.current &&
                loginFieldPhaseRef.current === "confirming_login_submit"
              ) {
                segmenterRef.current.reset();
                lastSttSubmissionRef.current = null;
                if (!isListeningRef.current || !hasLiveAudioTrack(micStreamRef.current)) {
                  void startVoiceListeningRef.current(false, false);
                }
                scheduleLoginConfirmWindow(retryGen);
              }
            },
          );
          return;
        }

        loginConfirmWindowGenRef.current++;
        speak(
          "Still waiting for your command. Automatic reminders are paused. Say sign in, repeat, or help at any time, or activate the Sign In button.",
          true,
          () => {
            if (
              pathnameRef.current === "/login" &&
              isVoiceGuideActiveRef.current &&
              !isAuthenticatedRef.current &&
              !isPausedRef.current &&
              !isSubmittingLoginRef.current &&
              loginFieldPhaseRef.current === "confirming_login_submit"
            ) {
              segmenterRef.current.reset();
              lastSttSubmissionRef.current = null;
            }
          },
        );
      }, LOGIN_CONFIRM_INACTIVITY_MS);
    },
    [speak],
  );

  const speakLoginSubmitPrompt = useCallback(
    (mode: "initial" | "repeat" | "help" | "unrecognized" | "stt_error", draftLength: number) => {
      clearLoginConfirmTimer();
      if (mode === "initial") {
        loginConfirmRepromptCountRef.current = 0;
      } else if (mode === "unrecognized" || mode === "stt_error") {
        loginConfirmRepromptCountRef.current = Math.min(
          MAX_LOGIN_CONFIRM_REPROMPTS,
          loginConfirmRepromptCountRef.current + 1,
        );
      }

      const gen = loginConfirmWindowGenRef.current;
      let promptText: string;
      let shouldScheduleWindow = true;

      if (mode === "initial" || mode === "repeat") {
        promptText = `Your email has been confirmed and your password has been captured, ${draftLength} characters. Say sign in to continue, add more to append characters, or change password to enter it again.`;
      } else if (mode === "help") {
        promptText = LOGIN_CONFIRM_HELP_TEXT;
      } else if (mode === "stt_error") {
        promptText =
          "Your command could not be recognized right now. Say sign in to try again, add more, or change password.";
        shouldScheduleWindow = loginConfirmRepromptCountRef.current < MAX_LOGIN_CONFIRM_REPROMPTS;
      } else if (loginConfirmRepromptCountRef.current >= MAX_LOGIN_CONFIRM_REPROMPTS) {
        promptText =
          "Command not recognized. Say sign in to continue, repeat, or help, or activate the Sign In button.";
        shouldScheduleWindow = false;
      } else {
        promptText =
          "Command not recognized. Say sign in to continue, add more to append characters, change password, or change email.";
      }

      speak(promptText, true, () => {
        if (
          loginConfirmWindowGenRef.current !== gen ||
          pathnameRef.current !== "/login" ||
          !isVoiceGuideActiveRef.current ||
          isAuthenticatedRef.current ||
          isPausedRef.current ||
          isLockedOutForSessionRef.current ||
          isDeactivatedForNonBlindRef.current ||
          isSubmittingLoginRef.current ||
          isCompletingLoginSuccessRef.current ||
          loginFieldPhaseRef.current !== "confirming_login_submit"
        ) {
          return;
        }
        segmenterRef.current.reset();
        lastSttSubmissionRef.current = null;
        if (!isListeningRef.current || !hasLiveAudioTrack(micStreamRef.current)) {
          void startVoiceListeningRef.current(false, false);
        }
        if (shouldScheduleWindow) {
          scheduleLoginConfirmWindow(gen);
        }
      });
    },
    [clearLoginConfirmTimer, scheduleLoginConfirmWindow, speak],
  );

  const completeBlindLoginSuccess = useCallback((): Promise<void> => {
    if (loginSuccessPromiseRef.current) {
      return loginSuccessPromiseRef.current;
    }

    cancelSpeech();
    abortInFlightStt();
    segmenterRef.current.reset();
    lastSttSubmissionRef.current = null;

    isManuallyPausedRef.current = true;
    wakeModeRef.current = false;
    onboardingCycleTokenRef.current++;
    setSyncOnboardingState("idle");
    blindLoginPendingRef.current = false;
    setBlindLoginPending(false);
    loginFieldPhaseRef.current = "idle";
    regFieldPhaseRef.current = "idle";
    clearAllLoginBuffers();
    clearAllRegistrationBuffers();

    isCompletingLoginSuccessRef.current = true;
    isSubmittingLoginRef.current = true;

    try {
      localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, "false");
    } catch {
      // ignore storage write errors
    }

    stopAudioPipeline("disabled");
    setVoiceGuidanceEnabled(false);
    voiceGuidanceEnabledRef.current = false;
    setPendingConfirmation(null);
    pendingConfirmationRef.current = null;
    setLastTranscript(null);
    setAssistantError(null);
    setTtsError(null);
    setWakeStatus("idle");
    setIsVoiceGuideActive(false);
    isVoiceGuideActiveRef.current = false;

    const promise = new Promise<void>((resolve) => {
      let settled = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (fallbackTimer !== null) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        if (timedOut) {
          cancelSpeech();
        }
        isCompletingLoginSuccessRef.current = false;
        isSubmittingLoginRef.current = false;
        loginSuccessPromiseRef.current = null;
        resolve();
      };

      fallbackTimer = setTimeout(() => {
        finish(true);
      }, LOGIN_SUCCESS_TTS_TIMEOUT_MS);

      const speakIdBefore = activeSpeakIdRef.current;
      speak(LOGIN_SUCCESS_ANNOUNCEMENT, true, () => {
        finish(false);
      });
      if (activeSpeakIdRef.current === speakIdBefore) {
        finish(false);
      }
    });

    loginSuccessPromiseRef.current = promise;
    return promise;
  }, [
    abortInFlightStt,
    cancelSpeech,
    clearAllLoginBuffers,
    clearAllRegistrationBuffers,
    setSyncOnboardingState,
    speak,
    stopAudioPipeline,
  ]);

  const lockOutBlindForSession = useCallback(() => {
    isLockedOutForSessionRef.current = true;
    setIsLockedOutForSession(true);
    isDeactivatedForNonBlindRef.current = true;
    wakeModeRef.current = false;
    onboardingCycleTokenRef.current++;
    setSyncOnboardingState("idle");
    setBlindActivationPending(false);
    blindLoginPendingRef.current = false;
    setBlindLoginPending(false);
    regFieldPhaseRef.current = "idle";
    loginFieldPhaseRef.current = "idle";
    clearAllRegistrationBuffers();
    clearAllLoginBuffers();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
    }
    setLastTranscript(null);
    setAssistantError(null);
    setTtsError(null);
    setVoiceGuidanceEnabled(false);
    voiceGuidanceEnabledRef.current = false;
    setIsVoiceGuideActive(false);
    isVoiceGuideActiveRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    cancelSpeech();
    stopAudioPipeline("disabled");
    setWakeStatus("locked_out");
  }, [
    cancelSpeech,
    clearAllLoginBuffers,
    clearAllRegistrationBuffers,
    setSyncOnboardingState,
    stopAudioPipeline,
  ]);

  const activateVoiceGuide = useCallback(
    (reason = "Voice guidance activated") => {
      if (!isUserEligibleForBlindVoice()) {
        return;
      }
      if (pathnameRef.current === "/register" && !isAuthenticatedRef.current) {
        void selectBlindProfileAndStart("visual");
        return;
      }
      if (pathnameRef.current === "/login" && !isAuthenticatedRef.current) {
        void startBlindVoiceLogin();
        void reason;
        return;
      }
      isDeactivatedForNonBlindRef.current = false;
      isManuallyPausedRef.current = false;
      setIsPaused(false);
      isPausedRef.current = false;
      setIsVoiceGuideActive(true);
      isVoiceGuideActiveRef.current = true;
      setVoiceState(isListeningRef.current ? "listening" : "paused");

      if (isAuthenticatedRef.current && authProfileRef.current === "blind") {
        try {
          localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, "true");
        } catch {
          // ignore
        }
        setVoiceGuidanceEnabled(true);
        voiceGuidanceEnabledRef.current = true;
      }

      const welcome = "VOXONIX voice assistant is ready. Say a command or say read this page.";
      speak(welcome, true);
      void reason;
    },
    [isUserEligibleForBlindVoice, selectBlindProfileAndStart, speak, startBlindVoiceLogin],
  );

  const deactivateVoiceGuide = useCallback(
    (silent = false) => {
      onboardingCycleTokenRef.current++;
      setSyncOnboardingState("idle");
      blindLoginPendingRef.current = false;
      setBlindLoginPending(false);
      setIsVoiceGuideActive(false);
      isVoiceGuideActiveRef.current = false;
      clearAllRegistrationBuffers();
      clearAllLoginBuffers();
      regFieldPhaseRef.current = "idle";
      loginFieldPhaseRef.current = "idle";
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
      }
      cancelSpeech();
      if (!silent) {
        setLastSpokenText("Voice guidance paused.");
      }
    },
    [cancelSpeech, clearAllLoginBuffers, clearAllRegistrationBuffers, setSyncOnboardingState],
  );

  const pauseListening = useCallback(
    (silent = false) => {
      clearLoginConfirmTimer();
      isManuallyPausedRef.current = true;
      setIsPaused(true);
      isPausedRef.current = true;
      stopAudioPipeline("paused");
      if (!silent && isVoiceGuideActiveRef.current) {
        speak("Microphone listening paused.", true);
      }
    },
    [clearLoginConfirmTimer, speak, stopAudioPipeline],
  );

  const disableVoiceGuidance = useCallback(() => {
    try {
      localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, "false");
    } catch {
      // ignore
    }
    isManuallyPausedRef.current = true;
    wakeModeRef.current = false;
    onboardingCycleTokenRef.current++;
    setSyncOnboardingState("idle");
    blindLoginPendingRef.current = false;
    setBlindLoginPending(false);
    regFieldPhaseRef.current = "idle";
    loginFieldPhaseRef.current = "idle";
    clearAllRegistrationBuffers();
    clearAllLoginBuffers();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
    }
    setVoiceGuidanceEnabled(false);
    voiceGuidanceEnabledRef.current = false;
    setIsVoiceGuideActive(false);
    isVoiceGuideActiveRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setPendingConfirmation(null);
    pendingConfirmationRef.current = null;
    setLastTranscript(null);
    setAssistantError(null);
    setTtsError(null);
    cancelSpeech();
    stopAudioPipeline("disabled");
  }, [
    cancelSpeech,
    clearAllLoginBuffers,
    clearAllRegistrationBuffers,
    setSyncOnboardingState,
    stopAudioPipeline,
  ]);

  const executeConfirmedAction = useCallback(
    (action: PendingConfirmationState["action"]) => {
      setPendingConfirmation(null);
      pendingConfirmationRef.current = null;

      if (action === "submit_registration") {
        const msg = "Submitting your VOXONIX registration now.";
        speak(msg, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "submit", spokenResponse: msg, nextStep: 5 },
          }),
        );
      } else if (action === "end_call") {
        speak("Ending the call now.", true);
        window.dispatchEvent(
          new CustomEvent("voxonix:call-action", {
            detail: { action: "leave_call" },
          }),
        );
      } else if (action === "logout") {
        speak("Signing out of VOXONIX.", true);
        void signOut().then(() => {
          navigate({ to: "/" });
        });
      }
    },
    [navigate, signOut, speak],
  );

  const confirmPendingAction = useCallback(() => {
    const pending = pendingConfirmationRef.current;
    if (pending) {
      executeConfirmedAction(pending.action);
    }
  }, [executeConfirmedAction]);

  const cancelPendingAction = useCallback(() => {
    if (!pendingConfirmationRef.current) return;
    setPendingConfirmation(null);
    pendingConfirmationRef.current = null;
    speak("Action canceled.", true);
  }, [speak]);

  const handleSharedEmailCaptureStep = useCallback(
    (
      flow: "register" | "login",
      text: string,
      interpretedIntent: ReturnType<typeof interpretVoiceCommand>["intent"],
    ): boolean => {
      const isLogin = flow === "login";
      const nextStepOnCandidate = isLogin ? 1 : 3;
      const nextStepOnConfirm = isLogin ? 2 : 4;

      const getPhase = () => (isLogin ? loginFieldPhaseRef.current : regFieldPhaseRef.current);
      const setConfirming = () => {
        if (isLogin) loginFieldPhaseRef.current = "confirming_login_email";
        else regFieldPhaseRef.current = "confirming_email";
      };
      const setSpelling = () => {
        if (isLogin) loginFieldPhaseRef.current = "spelling_login_email";
        else regFieldPhaseRef.current = "spelling_email";
      };
      const getCandidate = () =>
        isLogin ? pendingLoginEmailRef.current : pendingEmailCandidateRef.current;
      const setCandidate = (email: string | null) => {
        if (isLogin) pendingLoginEmailRef.current = email;
        else pendingEmailCandidateRef.current = email;
      };
      const getBuffer = () =>
        isLogin ? spelledLoginEmailBufferRef.current : spelledEmailBufferRef.current;
      const setBuffer = (buf: string) => {
        if (isLogin) spelledLoginEmailBufferRef.current = buf;
        else spelledEmailBufferRef.current = buf;
      };

      const buildConfirmReadbackPrompt = (readback: string) =>
        `I recorded ${readback}. Say confirm to continue, change username, change domain, or change to spell again.`;

      const promoteSpelledEmailCandidate = (rawEmailBuf: string) => {
        const emailRes = normalizeSpokenEmail(rawEmailBuf);
        if (!emailRes.valid) {
          speak(
            `Current email "${formatEmailBufferForReadback(rawEmailBuf)}" is incomplete or invalid. Keep spelling, say backspace, or say clear.`,
            true,
          );
          return false;
        }
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        setBuffer("");
        setCandidate(emailRes.email);
        setConfirming();
        const readback = formatEmailForReadback(emailRes.email);
        const confirmMsg = buildConfirmReadbackPrompt(readback);
        speak(confirmMsg, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: {
              intent: "candidate_email",
              candidateEmail: emailRes.email,
              extractedEmail: emailRes.email,
              spokenResponse: confirmMsg,
              nextStep: nextStepOnCandidate,
            },
          }),
        );
        return true;
      };

      const phase = getPhase();
      const candidate = getCandidate();
      const cleanEmailCmd = text
        .toLowerCase()
        .replace(/[.,!?]+/g, "")
        .trim();

      if ((phase === "confirming_email" || phase === "confirming_login_email") && candidate) {
        if (interpretedIntent === "confirm" || isAffirmativePhrase(text)) {
          setCandidate(null);
          setBuffer("");
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          if (isLogin) {
            confirmedLoginEmailRef.current = candidate;
            loginPasswordDraftRef.current = "";
            isSubmittingLoginRef.current = false;
            loginFieldPhaseRef.current = "listening_login_password";
            window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          } else {
            passwordDraftBufferRef.current = "";
            confirmPasswordDraftBufferRef.current = "";
            pendingPasswordCandidateRef.current = null;
            regFieldPhaseRef.current = "listening_password";
          }
          const msg = isLogin
            ? `Email confirmed as ${formatEmailForReadback(candidate)}. Now dictate your existing password in short chunks using capital or small letters, numbers, and symbol names like exclamation mark or underscore. Say next or done when finished. Your password stays masked and is never spoken aloud.`
            : `Email confirmed as ${formatEmailForReadback(candidate)}. Step 4 of 5: Password creation. Dictate your password in short chunks using capital or small letters, numbers, and symbol names like exclamation mark or underscore. Say next or done when finished. At least 6 characters. Your password stays masked and is never spoken aloud.`;
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "fill_email",
                extractedEmail: candidate,
                spokenResponse: msg,
                nextStep: nextStepOnConfirm,
              },
            }),
          );
          return true;
        }

        if (
          /^(?:change|edit|replace|respell|spell)\s+(?:the\s+|my\s+)?(?:username|user\s*name|local\s*part|first\s*part|before\s+(?:the\s+)?at(?:\s+sign)?)$/i.test(
            cleanEmailCmd,
          )
        ) {
          const [, currentDomain = ""] = candidate.split("@");
          preservedEmailDomainRef.current = currentDomain;
          preservedEmailLocalRef.current = "";
          setCandidate(null);
          setBuffer("");
          setSpelling();
          const preview = currentDomain ? `@${currentDomain}` : "";
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: preview,
                nextStep: nextStepOnCandidate,
              },
            }),
          );
          const msg = currentDomain
            ? `Keeping domain ${currentDomain.replace(/\./g, " dot ")}. Please spell the username before the at sign, letter by letter. Say done when finished.`
            : "Please spell the username before the at sign, letter by letter. Say done when finished.";
          speak(msg, true);
          return true;
        }

        if (
          /^(?:change|edit|replace|respell|spell)\s+(?:the\s+|my\s+)?(?:domain|provider|email\s*provider|host)$/i.test(
            cleanEmailCmd,
          )
        ) {
          const [currentLocal = ""] = candidate.split("@");
          preservedEmailLocalRef.current = currentLocal;
          preservedEmailDomainRef.current = "";
          const nextBuf = currentLocal ? `${currentLocal}@` : "";
          setCandidate(null);
          setBuffer(nextBuf);
          setSpelling();
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: nextBuf,
                nextStep: nextStepOnCandidate,
              },
            }),
          );
          const msg = `Keeping username ${formatSpelledLettersForTts(currentLocal)}. Now say or spell the email provider after the at sign, then say done.`;
          speak(msg, true);
          return true;
        }

        if (
          interpretedIntent === "repeat" ||
          /^(?:repeat|say again|read back|read email)$/i.test(cleanEmailCmd)
        ) {
          const readback = formatEmailForReadback(candidate);
          speak(buildConfirmReadbackPrompt(readback), true);
          return true;
        }

        if (
          interpretedIntent === "cancel" ||
          interpretedIntent === "change_email" ||
          interpretedIntent === "change_current" ||
          isNegativePhrase(text) ||
          isEmailSpellingTrigger(text) ||
          isSpellingTrigger(text) ||
          /^(?:restart|spell again|change email|start over)$/i.test(cleanEmailCmd)
        ) {
          setCandidate(null);
          setBuffer("");
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          if (isLogin) {
            confirmedLoginEmailRef.current = null;
          }
          setSpelling();
          const msg =
            "Cleared email. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_email", spokenResponse: msg, nextStep: nextStepOnCandidate },
            }),
          );
          return true;
        }

        const readback = formatEmailForReadback(candidate);
        speak(buildConfirmReadbackPrompt(readback), true);
        return true;
      }

      if (phase === "spelling_email" || phase === "spelling_login_email") {
        if (isSpellingBackspaceTrigger(text)) {
          pendingLastLetterRetryRef.current = null;
          const cur = getBuffer().slice(0, -1);
          setBuffer(cur);
          const preview =
            !cur.includes("@") && preservedEmailDomainRef.current
              ? `${cur}@${preservedEmailDomainRef.current}`
              : cur;
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: preview,
                nextStep: nextStepOnCandidate,
              },
            }),
          );
          speak(
            cur
              ? `Email so far: ${formatEmailBufferForReadback(cur)}. Continue spelling, or say done.`
              : "Email buffer is empty. Please spell the part before the at sign by saying each letter separately.",
            true,
          );
          return true;
        }

        if (isSpellingRepeatLetterTrigger(text)) {
          const cur = getBuffer();
          pendingLastLetterRetryRef.current = "email";
          speak(
            cur
              ? `I recognised ${formatEmailBufferForReadback(cur)}. Please repeat the last letter.`
              : "Email buffer is empty. Please spell the part before the at sign by saying each letter separately.",
            true,
          );
          return true;
        }

        if (isSpellingContinueTrigger(text)) {
          const cur = getBuffer();
          pendingLastLetterRetryRef.current = null;
          speak(
            cur
              ? `Continuing with ${formatEmailBufferForReadback(cur)}. Keep spelling, or say done when finished.`
              : "Email buffer is empty. Please spell the part before the at sign by saying each letter separately.",
            true,
          );
          return true;
        }

        if (
          isSpellingClearTrigger(text) ||
          /^(?:cancel|change|change it|edit)$/i.test(cleanEmailCmd)
        ) {
          pendingLastLetterRetryRef.current = null;
          setBuffer("");
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: "",
                nextStep: nextStepOnCandidate,
              },
            }),
          );
          speak(
            "Cleared email spelling. Please spell the part before the at sign by saying each letter separately.",
            true,
          );
          return true;
        }

        if (
          isSpellingNextChunkOrDoneTrigger(text) ||
          (/^(?:confirm|yes|yeah|yep|correct)$/i.test(cleanEmailCmd) &&
            (getBuffer().includes("@") || Boolean(preservedEmailDomainRef.current)))
        ) {
          pendingLastLetterRetryRef.current = null;
          const rawBuf = getBuffer();
          const effectiveBuf =
            !rawBuf.includes("@") && preservedEmailDomainRef.current
              ? `${rawBuf}@${preservedEmailDomainRef.current}`
              : rawBuf;
          promoteSpelledEmailCandidate(effectiveBuf);
          return true;
        }

        const chunkRes = parseSpelledEmailChunk(text, { currentBuffer: getBuffer() });
        if (!chunkRes.valid) {
          const preservedBuf = getBuffer() + (chunkRes.chunk || "");
          if (chunkRes.chunk) {
            setBuffer(preservedBuf);
            const preview =
              !preservedBuf.includes("@") && preservedEmailDomainRef.current
                ? `${preservedBuf}@${preservedEmailDomainRef.current}`
                : preservedBuf;
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "spelling_email_progress",
                  extractedEmail: preview,
                  nextStep: nextStepOnCandidate,
                },
              }),
            );
          }
          pendingLastLetterRetryRef.current = "email";
          if (preservedBuf) {
            speak(
              `I recognised ${formatEmailBufferForReadback(preservedBuf)}. Please repeat the last character.`,
              true,
            );
          } else {
            speak(
              `${chunkRes.error || "Could not understand email characters."} Spell letters separately, speak numbers individually, or say done.`,
              true,
            );
          }
          return true;
        }

        pendingLastLetterRetryRef.current = null;
        const nextRawBuf = getBuffer() + chunkRes.chunk;
        setBuffer(nextRawBuf);
        const effectiveBuf =
          !nextRawBuf.includes("@") && preservedEmailDomainRef.current
            ? `${nextRawBuf}@${preservedEmailDomainRef.current}`
            : nextRawBuf;

        const hasCompleteKnownDomain =
          /@(?:gmail|yahoo|outlook|hotmail|protonmail|icloud)\.(?:com|org|net|in)$/i.test(
            effectiveBuf,
          );
        if (chunkRes.endRequested || hasCompleteKnownDomain) {
          if (promoteSpelledEmailCandidate(effectiveBuf)) {
            return true;
          }
        }

        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: {
              intent: "spelling_email_progress",
              extractedEmail: effectiveBuf,
              nextStep: nextStepOnCandidate,
            },
          }),
        );
        speak(
          `Email so far: ${formatEmailBufferForReadback(nextRawBuf)}. Keep spelling, say backspace to undo, or say done when finished.`,
          true,
        );
        return true;
      }

      if (isEmailSpellingTrigger(text) || isSpellingTrigger(text)) {
        setCandidate(null);
        setBuffer("");
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        setSpelling();
        speak(
          "Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.",
          true,
        );
        return true;
      }

      const emailRes = normalizeSpokenEmail(text);
      if (emailRes.valid) {
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        setCandidate(emailRes.email);
        setConfirming();
        const readback = formatEmailForReadback(emailRes.email);
        const confirmMsg = buildConfirmReadbackPrompt(readback);
        speak(confirmMsg, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: {
              intent: "candidate_email",
              candidateEmail: emailRes.email,
              extractedEmail: emailRes.email,
              spokenResponse: confirmMsg,
              nextStep: nextStepOnCandidate,
            },
          }),
        );
        return true;
      }

      setSpelling();
      speak(
        emailRes.error ||
          "Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.",
        true,
      );
      return true;
    },
    [speak],
  );

  const handleSharedPasswordCaptureStep = useCallback(
    (
      mode: "register_password" | "register_confirm" | "login_password",
      rawTranscript: string,
    ): boolean => {
      setLastTranscript(null);
      const text = rawTranscript.trim();
      const cleanCmd = text
        .toLowerCase()
        .replace(/[.,!?]+/g, "")
        .trim();

      const getDraft = () =>
        mode === "register_password"
          ? passwordDraftBufferRef.current
          : mode === "register_confirm"
            ? confirmPasswordDraftBufferRef.current
            : loginPasswordDraftRef.current;

      const setDraft = (val: string) => {
        if (mode === "register_password") passwordDraftBufferRef.current = val;
        else if (mode === "register_confirm") confirmPasswordDraftBufferRef.current = val;
        else loginPasswordDraftRef.current = val;
      };

      const syncMaskedPasswordUi = (val: string) => {
        if (mode === "register_confirm") return;
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "fill_voice_password", extractedPassword: val },
          }),
        );
      };

      const finalizeDraft = (draft: string) => {
        if (mode === "register_password") {
          if (draft.length < 6) {
            speak(
              `Password currently has ${draft.length} characters, and at least 6 are required. Dictate more characters, or say change to start over.`,
              true,
            );
            return;
          }
          passwordDraftBufferRef.current = "";
          pendingPasswordCandidateRef.current = draft;
          regFieldPhaseRef.current = "confirming_password";
          syncMaskedPasswordUi(draft);
          speak(
            `Password captured in the masked field, ${draft.length} characters. Say confirm to verify your confirm password, add more to append characters, or say change to start over.`,
            true,
          );
          return;
        }

        if (mode === "register_confirm") {
          const expected = pendingPasswordCandidateRef.current;
          if (!expected) {
            confirmPasswordDraftBufferRef.current = "";
            regFieldPhaseRef.current = "listening_password";
            speak(
              "Please dictate your password in short chunks first, then say next or done.",
              true,
            );
            return;
          }
          if (draft === expected) {
            pendingPasswordCandidateRef.current = null;
            passwordDraftBufferRef.current = "";
            confirmPasswordDraftBufferRef.current = "";
            regFieldPhaseRef.current = "confirming_submit";
            const msg =
              "Both passwords match! Step 5 of 5: Review your details and say confirm or submit to create your account, or say start again to restart.";
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "fill_voice_confirm_password",
                  extractedConfirmPassword: draft,
                  matched: true,
                  nextStep: 5,
                },
              }),
            );
            const conf: PendingConfirmationState = {
              action: "submit_registration",
              prompt: msg,
            };
            setPendingConfirmation(conf);
            pendingConfirmationRef.current = conf;
            speak(msg, true);
            return;
          }
          confirmPasswordDraftBufferRef.current = "";
          regFieldPhaseRef.current = "listening_confirm_password";
          speak(
            `Confirm password (${draft.length} characters) does not match your password (${expected.length} characters). Confirm password cleared. Dictate the exact same password in short chunks and say next or done, or say change password to re-enter both.`,
            true,
          );
          return;
        }

        // login_password
        if (draft.length === 0) {
          speak(
            "Password is still empty. Dictate your password in short chunks and say next or done when finished.",
            true,
          );
          return;
        }
        isSubmittingLoginRef.current = false;
        loginFieldPhaseRef.current = "confirming_login_submit";
        segmenterRef.current.reset();
        lastSttSubmissionRef.current = null;
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "login_password_ready", extractedPassword: draft },
          }),
        );
        speakLoginSubmitPrompt("initial", draft.length);
      };

      if (isSpellingClearTrigger(text) || /^(?:cancel|change|change it|edit)$/i.test(cleanCmd)) {
        setDraft("");
        if (mode === "register_password") {
          pendingPasswordCandidateRef.current = null;
          confirmPasswordDraftBufferRef.current = "";
          window.dispatchEvent(new CustomEvent(REGISTER_PROTECTED_RESET_EVENT));
          speak(
            "Cleared password. Dictate your password in short chunks using capital or small letters, numbers, and symbol names. Say next or done when finished.",
            true,
          );
        } else if (mode === "register_confirm") {
          speak(
            "Cleared confirm password draft. Dictate your confirm password in short chunks and say next or done, or say change password to start over.",
            true,
          );
        } else {
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          speak(
            "Cleared password. Dictate your password in short chunks and say next or done when finished.",
            true,
          );
        }
        return true;
      }

      if (isSpellingBackspaceTrigger(text)) {
        const cur = getDraft();
        if (cur.length > 0) {
          const next = cur.slice(0, -1);
          setDraft(next);
          syncMaskedPasswordUi(next);
          speak(
            `Removed last character. Masked draft now has ${next.length} characters. Continue dictating or say next or done.`,
            true,
          );
        } else {
          speak(
            "Password draft is empty. Dictate a short chunk using capital or small letters, numbers, and symbol names.",
            true,
          );
        }
        return true;
      }

      if (isSpellingNextChunkOrDoneTrigger(text)) {
        finalizeDraft(getDraft());
        return true;
      }

      const pwdRes = parseSpelledPassword(rawTranscript);
      if (!pwdRes.valid) {
        const curLen = getDraft().length;
        speak(
          `${
            pwdRes.error || "Could not reliably capture characters from that chunk."
          }${curLen > 0 ? ` Keeping your ${curLen} captured characters.` : ""} Dictate a short chunk using capital or small letters, numbers, and symbol names, or say next or done.`,
          true,
        );
        return true;
      }

      const combined = getDraft() + pwdRes.password;
      if (combined.length > 256) {
        setDraft("");
        if (mode === "register_password") {
          window.dispatchEvent(new CustomEvent(REGISTER_PROTECTED_RESET_EVENT));
        } else if (mode === "login_password") {
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
        }
        speak("Password exceeded 256 characters and was cleared. Please dictate again.", true);
        return true;
      }

      setDraft(combined);
      syncMaskedPasswordUi(combined);

      if (pwdRes.endRequested) {
        finalizeDraft(combined);
        return true;
      }

      if (mode === "register_password" && combined.length < 6) {
        speak(
          `Captured ${combined.length} characters so far. Passwords require at least 6 characters. Dictate more characters, or say backspace to undo.`,
          true,
        );
      } else {
        speak(
          `Captured ${combined.length} characters in the masked field. Dictate more characters, or say next or done when finished.`,
          true,
        );
      }
      return true;
    },
    [speak, speakLoginSubmitPrompt],
  );

  const handleRecognizedTranscript = useCallback(
    async (transcript: string) => {
      if (!isUserEligibleForBlindVoice()) return;
      const text = transcript.trim();
      if (!text) return;

      const currentRoute = pathnameRef.current || "/";

      // 0. Landing page post-"Blind" wake choice: Register vs Sign In
      if (currentRoute === "/") {
        if (onboardingStateRef.current !== "awaiting_auth_intent") {
          return;
        }
        if (isOnboardingRegisterChoice(text)) {
          void selectBlindProfileAndStart("wake");
          return;
        }
        if (isOnboardingSignInChoice(text)) {
          void startBlindVoiceLogin();
          return;
        }
        const cleanChoice = text
          .toLowerCase()
          .replace(/[.,!?]+/g, "")
          .trim();
        if (/^(?:repeat|say again|pardon)$/.test(cleanChoice)) {
          speak(
            "Welcome to VOXONIX. Would you like to register a new account or sign in to your existing account? Say register or sign in.",
            true,
          );
          return;
        }
        if (/^(?:stop|cancel|never mind|exit|stop assistant)$/.test(cleanChoice)) {
          lockOutBlindForSession();
          return;
        }
        speak(
          "Please say register for a new account, or say sign in to your existing account.",
          true,
        );
        return;
      }

      let currentStep = 1;
      if (typeof document !== "undefined") {
        const stepAttr = document
          .querySelector("[data-registration-step]")
          ?.getAttribute("data-registration-step");
        if (stepAttr) {
          const parsed = parseInt(stepAttr, 10);
          if (!Number.isNaN(parsed)) currentStep = parsed;
        }
      }

      if (currentRoute === "/register" && regFieldPhaseRef.current === "idle") {
        if (currentStep === 2) regFieldPhaseRef.current = "spelling_first_name";
        else if (currentStep === 3) regFieldPhaseRef.current = "spelling_email";
        else if (currentStep === 4) {
          const activeEl = typeof document !== "undefined" ? document.activeElement : null;
          regFieldPhaseRef.current =
            activeEl instanceof HTMLElement && activeEl.id === "reg-confirm-password"
              ? "listening_confirm_password"
              : "listening_password";
        } else if (currentStep === 5) regFieldPhaseRef.current = "confirming_submit";
      }

      if (currentRoute === "/login" && loginFieldPhaseRef.current === "idle") {
        loginFieldPhaseRef.current = "spelling_login_email";
      }

      const phaseBefore = regFieldPhaseRef.current;
      const loginPhaseBefore = loginFieldPhaseRef.current;
      const isCapturingField =
        (currentRoute === "/register" &&
          ((currentStep === 2 &&
            !pendingNameCandidateRef.current &&
            (phaseBefore === "listening_name" ||
              phaseBefore === "spelling_first_name" ||
              phaseBefore === "spelling_surname")) ||
            (currentStep === 3 &&
              !pendingEmailCandidateRef.current &&
              (phaseBefore === "listening_email" || phaseBefore === "spelling_email")) ||
            (currentStep === 4 &&
              (phaseBefore === "listening_password" ||
                phaseBefore === "listening_confirm_password")))) ||
        (currentRoute === "/login" &&
          ((!pendingLoginEmailRef.current &&
            (loginPhaseBefore === "listening_login_email" ||
              loginPhaseBefore === "spelling_login_email")) ||
            loginPhaseBefore === "listening_login_password"));

      const interpreted = interpretVoiceCommand(text, {
        currentRoute,
        registrationStep: currentStep,
        isAuthenticated: isAuthenticatedRef.current,
        isInCall: currentRoute.startsWith("/room/"),
        hasPendingConfirmation: Boolean(pendingConfirmationRef.current),
        isCapturingField,
      });

      // 1. Immediate speech/mic/registration control commands
      if (interpreted.intent === "stop_speaking") {
        cancelSpeech();
        return;
      }
      if (interpreted.intent === "stop_assistant") {
        disableVoiceGuidance();
        return;
      }
      if (interpreted.intent === "pause_listening") {
        pauseListening(true);
        setLastSpokenText("Microphone listening paused.");
        return;
      }
      if (interpreted.intent === "repeat") {
        if (
          currentRoute === "/login" &&
          !isAuthenticatedRef.current &&
          loginFieldPhaseRef.current === "confirming_login_submit"
        ) {
          speakLoginSubmitPrompt("repeat", loginPasswordDraftRef.current.length);
          return;
        }
        repeatLastSpoken();
        return;
      }
      if (interpreted.intent === "help_registration") {
        if (
          currentRoute === "/login" &&
          !isAuthenticatedRef.current &&
          loginFieldPhaseRef.current === "confirming_login_submit"
        ) {
          speakLoginSubmitPrompt("help", loginPasswordDraftRef.current.length);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "help" },
            }),
          );
          return;
        }
        speak(interpreted.spokenResponse, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "help" },
          }),
        );
        return;
      }
      if (interpreted.intent === "repeat_instruction") {
        if (
          currentRoute === "/login" &&
          !isAuthenticatedRef.current &&
          loginFieldPhaseRef.current === "confirming_login_submit"
        ) {
          speakLoginSubmitPrompt("repeat", loginPasswordDraftRef.current.length);
          return;
        }
        if (currentRoute === "/register" || currentRoute === "/login") {
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "repeat" },
            }),
          );
        } else {
          repeatLastSpoken();
        }
        return;
      }

      // 1b. Gnani-Powered Blind Voice Login State Machine (/login)
      if (currentRoute === "/login" && !isAuthenticatedRef.current) {
        if (
          isSubmittingLoginRef.current ||
          isCompletingLoginSuccessRef.current ||
          loginFieldPhaseRef.current === "submitting_login"
        ) {
          return;
        }

        const cleanLoginText = normalizeLoginCommandText(text);
        const isLoginEmailPhase =
          loginFieldPhaseRef.current === "listening_login_email" ||
          loginFieldPhaseRef.current === "spelling_login_email" ||
          loginFieldPhaseRef.current === "confirming_login_email";

        if (
          loginFieldPhaseRef.current === "confirming_login_submit" &&
          (interpreted.intent === "cancel" || /^(?:stop|cancel)$/.test(cleanLoginText))
        ) {
          disableVoiceGuidance();
          return;
        }

        if (
          interpreted.intent === "read_page" &&
          loginFieldPhaseRef.current !== "listening_login_password"
        ) {
          clearLoginConfirmTimer();
          speak(summarizeCurrentPageText(), true);
          return;
        }
        if (
          interpreted.intent === "read_current_field" &&
          loginFieldPhaseRef.current !== "listening_login_password"
        ) {
          clearLoginConfirmTimer();
          speak(readFocusedFieldSummary(), true);
          return;
        }
        if (
          interpreted.intent === "scroll" &&
          loginFieldPhaseRef.current !== "listening_login_password"
        ) {
          clearLoginConfirmTimer();
          if (typeof window !== "undefined") {
            window.scrollBy({
              top: interpreted.scrollDirection === "up" ? -480 : 480,
              behavior: "smooth",
            });
          }
          speak(interpreted.spokenResponse, true);
          return;
        }

        if (interpreted.intent === "start_again") {
          clearAllLoginBuffers();
          setLastTranscript(null);
          loginFieldPhaseRef.current = "spelling_login_email";
          const msg =
            "Starting sign in again. All login fields cleared. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "start_again", spokenResponse: msg },
            }),
          );
          return;
        }

        if (
          loginFieldPhaseRef.current === "confirming_login_submit" &&
          confirmedLoginEmailRef.current &&
          /^(?:change|edit|replace|respell|spell)\s+(?:the\s+|my\s+)?(?:username|user\s*name|local\s*part|first\s*part|before\s+(?:the\s+)?at(?:\s+sign)?)$/.test(
            cleanLoginText,
          )
        ) {
          const [, currentDomain = ""] = confirmedLoginEmailRef.current.split("@");
          clearLoginConfirmTimer();
          loginConfirmRepromptCountRef.current = 0;
          pendingLoginEmailRef.current = null;
          confirmedLoginEmailRef.current = null;
          spelledLoginEmailBufferRef.current = "";
          preservedEmailDomainRef.current = currentDomain;
          preservedEmailLocalRef.current = "";
          loginPasswordDraftRef.current = "";
          isSubmittingLoginRef.current = false;
          loginFieldPhaseRef.current = "spelling_login_email";
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          const preview = currentDomain ? `@${currentDomain}` : "";
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: preview,
              },
            }),
          );
          const msg = currentDomain
            ? `Keeping domain ${currentDomain.replace(/\./g, " dot ")}. Please spell the username before the at sign, letter by letter. Say done when finished.`
            : "Please spell the username before the at sign, letter by letter. Say done when finished.";
          speak(msg, true);
          return;
        }

        if (
          loginFieldPhaseRef.current === "confirming_login_submit" &&
          confirmedLoginEmailRef.current &&
          /^(?:change|edit|replace|respell|spell)\s+(?:the\s+|my\s+)?(?:domain|provider|email\s*provider|host)$/.test(
            cleanLoginText,
          )
        ) {
          const [currentLocal = ""] = confirmedLoginEmailRef.current.split("@");
          clearLoginConfirmTimer();
          loginConfirmRepromptCountRef.current = 0;
          pendingLoginEmailRef.current = null;
          confirmedLoginEmailRef.current = null;
          preservedEmailDomainRef.current = "";
          preservedEmailLocalRef.current = currentLocal;
          const nextBuf = currentLocal ? `${currentLocal}@` : "";
          spelledLoginEmailBufferRef.current = nextBuf;
          loginPasswordDraftRef.current = "";
          isSubmittingLoginRef.current = false;
          loginFieldPhaseRef.current = "spelling_login_email";
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_email_progress",
                extractedEmail: nextBuf,
              },
            }),
          );
          const msg = currentLocal
            ? `Keeping username ${formatSpelledLettersForTts(currentLocal)}. Please say or spell your email provider after the at sign.`
            : "Please say or spell your email provider after the at sign.";
          speak(msg, true);
          return;
        }

        if (
          interpreted.intent === "change_email" ||
          (isLoginEmailPhase &&
            loginFieldPhaseRef.current !== "spelling_login_email" &&
            interpreted.intent === "change_current")
        ) {
          clearLoginConfirmTimer();
          loginConfirmRepromptCountRef.current = 0;
          pendingLoginEmailRef.current = null;
          confirmedLoginEmailRef.current = null;
          spelledLoginEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          loginPasswordDraftRef.current = "";
          isSubmittingLoginRef.current = false;
          loginFieldPhaseRef.current = "spelling_login_email";
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          const msg =
            "Cleared email. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_email", spokenResponse: msg },
            }),
          );
          return;
        }

        if (
          interpreted.intent === "change_password" ||
          (!isLoginEmailPhase &&
            loginFieldPhaseRef.current !== "listening_login_password" &&
            interpreted.intent === "change_current")
        ) {
          clearLoginConfirmTimer();
          loginConfirmRepromptCountRef.current = 0;
          loginPasswordDraftRef.current = "";
          isSubmittingLoginRef.current = false;
          loginFieldPhaseRef.current = "listening_login_password";
          window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
          const msg =
            "Cleared password. Please dictate your existing password in short chunks using capital or small letters, numbers, and symbol names. Say next or done when finished.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_passwords", spokenResponse: msg },
            }),
          );
          return;
        }

        if (
          interpreted.intent === "go_back_step" ||
          /^(?:go back|previous step|back)$/.test(cleanLoginText)
        ) {
          clearLoginConfirmTimer();
          loginConfirmRepromptCountRef.current = 0;
          if (loginFieldPhaseRef.current === "confirming_login_submit") {
            loginPasswordDraftRef.current = "";
            isSubmittingLoginRef.current = false;
            loginFieldPhaseRef.current = "listening_login_password";
            window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
            const msg =
              "Going back to password entry. Dictate your existing password in short chunks and say next or done when finished.";
            speak(msg, true);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "reset_passwords", spokenResponse: msg },
              }),
            );
            return;
          }
          if (loginFieldPhaseRef.current === "listening_login_password") {
            clearAllLoginBuffers();
            loginFieldPhaseRef.current = "spelling_login_email";
            window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));
            const msg =
              "Going back to email entry. Please spell the part before the at sign by saying each letter separately.";
            speak(msg, true);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "reset_email", spokenResponse: msg },
              }),
            );
            return;
          }
          pendingLoginEmailRef.current = null;
          spelledLoginEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          loginFieldPhaseRef.current = "spelling_login_email";
          speak(
            "You are at email entry. Please spell the part before the at sign by saying each letter separately.",
            true,
          );
          return;
        }

        if (
          loginFieldPhaseRef.current === "listening_login_email" ||
          loginFieldPhaseRef.current === "spelling_login_email" ||
          loginFieldPhaseRef.current === "confirming_login_email"
        ) {
          handleSharedEmailCaptureStep("login", text, interpreted.intent);
          return;
        }

        if (loginFieldPhaseRef.current === "listening_login_password") {
          handleSharedPasswordCaptureStep("login_password", transcript);
          return;
        }

        if (loginFieldPhaseRef.current === "confirming_login_submit") {
          clearLoginConfirmTimer();
          setLastTranscript(null);
          if (
            interpreted.intent === "add_password_chars" ||
            /^(?:add more|add more characters|more characters|add characters|append(?: characters)?|continue password)$/.test(
              cleanLoginText,
            )
          ) {
            loginConfirmRepromptCountRef.current = 0;
            loginFieldPhaseRef.current = "listening_login_password";
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "fill_voice_password",
                  extractedPassword: loginPasswordDraftRef.current,
                },
              }),
            );
            speak(
              `Ready to append more characters. Currently ${loginPasswordDraftRef.current.length} characters captured. Dictate additional characters, then say next or done when finished.`,
              true,
            );
            return;
          }
          if (
            isUnambiguousLoginSubmitCommand(text) ||
            (interpreted.intent === "submit" &&
              !/\b(?:not|no|cancel|stop|change|add|edit|clear|reset)\b/i.test(cleanLoginText))
          ) {
            if (!confirmedLoginEmailRef.current) {
              loginConfirmRepromptCountRef.current = 0;
              loginFieldPhaseRef.current = "spelling_login_email";
              speak(
                "Please spell the part before the at sign by saying each letter separately first.",
                true,
              );
              return;
            }
            if (loginPasswordDraftRef.current.length === 0) {
              loginConfirmRepromptCountRef.current = 0;
              loginFieldPhaseRef.current = "listening_login_password";
              speak(
                "Please dictate your password in short chunks and say next or done before signing in.",
                true,
              );
              return;
            }
            if (isSubmittingLoginRef.current || isCompletingLoginSuccessRef.current) return;
            clearLoginConfirmTimer();
            isSubmittingLoginRef.current = true;
            loginFieldPhaseRef.current = "submitting_login";
            abortInFlightStt();
            segmenterRef.current.reset();
            lastSttSubmissionRef.current = null;
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "submit_login" },
              }),
            );
            return;
          }
          speakLoginSubmitPrompt("unrecognized", loginPasswordDraftRef.current.length);
          return;
        }
      }

      if (interpreted.intent === "start_again" && currentRoute === "/register") {
        clearAllRegistrationBuffers();
        setLastTranscript(null);
        regFieldPhaseRef.current = "spelling_first_name";
        const msg =
          "Starting registration again. All fields cleared. Step 2 of 5: Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname.";
        speak(msg, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "start_again", spokenResponse: msg, nextStep: 2 },
          }),
        );
        return;
      }

      if (interpreted.intent === "go_back_step" && currentRoute === "/register") {
        if (currentStep <= 2) {
          pendingNameCandidateRef.current = null;
          spelledFirstNameBufferRef.current = "";
          spelledSurnameBufferRef.current = "";
          regFieldPhaseRef.current = "spelling_first_name";
          const msg =
            "You are at Step 2: Full Name. Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_name", spokenResponse: msg, nextStep: 2 },
            }),
          );
        } else if (currentStep === 3) {
          pendingEmailCandidateRef.current = null;
          pendingNameCandidateRef.current = null;
          spelledEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          spelledFirstNameBufferRef.current = "";
          spelledSurnameBufferRef.current = "";
          confirmedNameRef.current = null;
          regFieldPhaseRef.current = "spelling_first_name";
          const msg =
            "Going back to Step 2: Full Name. Please spell your first name by saying each letter separately.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "enter_name", spokenResponse: msg, nextStep: 2 },
            }),
          );
        } else if (currentStep === 4) {
          pendingPasswordCandidateRef.current = null;
          passwordDraftBufferRef.current = "";
          confirmPasswordDraftBufferRef.current = "";
          pendingEmailCandidateRef.current = null;
          spelledEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          regFieldPhaseRef.current = "spelling_email";
          const msg =
            "Going back to Step 3: Email address. Please spell the part before the at sign by saying each letter separately.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "enter_email", spokenResponse: msg, nextStep: 3 },
            }),
          );
        } else {
          pendingPasswordCandidateRef.current = null;
          passwordDraftBufferRef.current = "";
          confirmPasswordDraftBufferRef.current = "";
          setPendingConfirmation(null);
          pendingConfirmationRef.current = null;
          regFieldPhaseRef.current = "listening_password";
          const msg =
            "Going back to Step 4: Password creation. Dictate your password in short chunks and say next or done when finished.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_passwords", spokenResponse: msg, nextStep: 4 },
            }),
          );
        }
        return;
      }

      // Field reset commands during active /register steps (always honored cleanly before field parsers)
      if (currentRoute === "/register") {
        if (
          interpreted.intent === "change_password" ||
          (currentStep >= 4 &&
            regFieldPhaseRef.current !== "listening_password" &&
            regFieldPhaseRef.current !== "listening_confirm_password" &&
            interpreted.intent === "change_current")
        ) {
          pendingPasswordCandidateRef.current = null;
          passwordDraftBufferRef.current = "";
          confirmPasswordDraftBufferRef.current = "";
          setPendingConfirmation(null);
          pendingConfirmationRef.current = null;
          regFieldPhaseRef.current = "listening_password";
          const msg =
            "Cleared password fields. Dictate your password in short chunks using capital or small letters, numbers, and symbol names. Say next or done when finished.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_passwords", spokenResponse: msg, nextStep: 4 },
            }),
          );
          return;
        }
        if (
          interpreted.intent === "change_email" ||
          (currentStep === 3 &&
            regFieldPhaseRef.current !== "spelling_email" &&
            interpreted.intent === "change_current")
        ) {
          pendingEmailCandidateRef.current = null;
          spelledEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          setPendingConfirmation(null);
          pendingConfirmationRef.current = null;
          regFieldPhaseRef.current = "spelling_email";
          const msg =
            "Cleared email. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_email", spokenResponse: msg, nextStep: 3 },
            }),
          );
          return;
        }
        if (
          interpreted.intent === "change_name" ||
          (currentStep === 2 && interpreted.intent === "change_current")
        ) {
          if (
            interpreted.intent === "change_current" &&
            regFieldPhaseRef.current === "spelling_surname"
          ) {
            spelledSurnameBufferRef.current = "";
            const keptFirst = formatTitleWord(spelledFirstNameBufferRef.current);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "spelling_name_progress", extractedName: keptFirst, nextStep: 2 },
              }),
            );
            speak(
              "Cleared surname. Spell your surname one letter at a time, say done when finished, or say skip.",
              true,
            );
            return;
          }
          pendingNameCandidateRef.current = null;
          confirmedNameRef.current = null;
          spelledFirstNameBufferRef.current = "";
          spelledSurnameBufferRef.current = "";
          setPendingConfirmation(null);
          pendingConfirmationRef.current = null;
          regFieldPhaseRef.current = "spelling_first_name";
          const msg =
            "Cleared name. Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish.";
          speak(msg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: { intent: "reset_name", spokenResponse: msg, nextStep: 2 },
            }),
          );
          return;
        }
      }

      // 2. Step-4 Shared Chunk-Based Password Capture & Matching (/register)
      if (currentRoute === "/register" && currentStep === 4) {
        if (regFieldPhaseRef.current === "listening_password") {
          handleSharedPasswordCaptureStep("register_password", transcript);
          return;
        }

        if (regFieldPhaseRef.current === "confirming_password") {
          setLastTranscript(null);
          const cleanPwdCmd = text
            .toLowerCase()
            .replace(/[.,!?]+/g, "")
            .trim();
          if (
            /^(?:add more|more characters|add characters|append|continue password)$/i.test(
              cleanPwdCmd,
            ) &&
            pendingPasswordCandidateRef.current
          ) {
            passwordDraftBufferRef.current = pendingPasswordCandidateRef.current;
            pendingPasswordCandidateRef.current = null;
            regFieldPhaseRef.current = "listening_password";
            speak(
              `Ready to append more characters. Currently ${passwordDraftBufferRef.current.length} characters captured. Dictate additional characters, then say next or done when finished.`,
              true,
            );
            return;
          }
          if (interpreted.intent === "confirm" || isAffirmativePhrase(text)) {
            confirmPasswordDraftBufferRef.current = "";
            regFieldPhaseRef.current = "listening_confirm_password";
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "focus_confirm_password" },
              }),
            );
            speak(
              "Password accepted. Now dictate your confirm password in short chunks using capital or small letters, numbers, and symbol names. Say next or done when finished.",
              true,
            );
            return;
          }
          if (interpreted.intent === "cancel" || isNegativePhrase(text)) {
            pendingPasswordCandidateRef.current = null;
            passwordDraftBufferRef.current = "";
            confirmPasswordDraftBufferRef.current = "";
            regFieldPhaseRef.current = "listening_password";
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "reset_passwords", nextStep: 4 },
              }),
            );
            speak(
              "Cleared password. Dictate your password in short chunks and say next or done when finished.",
              true,
            );
            return;
          }
          speak(
            "Say confirm to verify your confirm password, add more to append characters, or say change to dictate your password again.",
            true,
          );
          return;
        }

        if (regFieldPhaseRef.current === "listening_confirm_password") {
          handleSharedPasswordCaptureStep("register_confirm", transcript);
          return;
        }
      }

      // 3. Pending confirmation resolution (Step 5 / logout / end call)
      if (pendingConfirmationRef.current) {
        if (
          interpreted.intent === "confirm" ||
          interpreted.intent === "submit" ||
          isAffirmativePhrase(text)
        ) {
          confirmPendingAction();
          return;
        }
        if (interpreted.intent === "cancel" || isNegativePhrase(text)) {
          cancelPendingAction();
          return;
        }
      }

      // 4. Step 2: Name Capture (Letter-by-Letter Ordinary Alphabet Spelling Primary)
      if (currentRoute === "/register" && currentStep === 2) {
        const finalizeSpelledNameCandidate = (rawFirst: string, rawSurname: string) => {
          pendingLastLetterRetryRef.current = null;
          const fullName = [formatMultiWordTitle(rawFirst), formatMultiWordTitle(rawSurname)]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (fullName.length < 2) {
            spelledFirstNameBufferRef.current = "";
            spelledSurnameBufferRef.current = "";
            regFieldPhaseRef.current = "spelling_first_name";
            speak(
              "Name must be at least 2 characters. Please spell your first name by saying each letter separately.",
              true,
            );
            return;
          }
          spelledFirstNameBufferRef.current = "";
          spelledSurnameBufferRef.current = "";
          pendingNameCandidateRef.current = fullName;
          regFieldPhaseRef.current = "confirming_name";
          const readback = formatNameForReadback(fullName);
          const confirmMsg = `I recorded ${readback}. Say confirm if this is right, say replace first name, replace surname, or say restart to spell again.`;
          speak(confirmMsg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "candidate_name",
                candidateName: fullName,
                extractedName: fullName,
                spokenResponse: confirmMsg,
                nextStep: 2,
              },
            }),
          );
        };

        const cleanNameCmd = text
          .toLowerCase()
          .replace(/[.,!?]+/g, "")
          .trim();

        if (regFieldPhaseRef.current === "confirming_name" && pendingNameCandidateRef.current) {
          if (interpreted.intent === "confirm" || isAffirmativePhrase(text)) {
            const confirmedName = pendingNameCandidateRef.current;
            pendingNameCandidateRef.current = null;
            confirmedNameRef.current = confirmedName;
            regFieldPhaseRef.current = "spelling_email";
            const msg = `Name confirmed as ${confirmedName}. Step 3 of 5: Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.`;
            speak(msg, true);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "fill_name",
                  extractedName: confirmedName,
                  spokenResponse: msg,
                  nextStep: 3,
                },
              }),
            );
            return;
          }

          if (
            /^(?:replace|change|edit|respell)\s+(?:the\s+|my\s+)?(?:first\s*name|given\s*name)$/i.test(
              cleanNameCmd,
            )
          ) {
            const parts = pendingNameCandidateRef.current.trim().split(/\s+/).filter(Boolean);
            const keptSurname = parts.length > 1 ? parts.slice(1).join(" ") : "";
            pendingNameCandidateRef.current = null;
            spelledFirstNameBufferRef.current = "";
            spelledSurnameBufferRef.current = keptSurname;
            regFieldPhaseRef.current = "spelling_first_name";
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "spelling_name_progress",
                  extractedName: keptSurname ? formatMultiWordTitle(keptSurname) : "",
                  nextStep: 2,
                },
              }),
            );
            const msg = keptSurname
              ? `Cleared first name. Keeping surname ${formatSpelledLettersForTts(keptSurname)}. Please spell your first name letter by letter, then say done.`
              : "Cleared first name. Please spell your first name letter by letter, then say done.";
            speak(msg, true);
            return;
          }

          if (
            /^(?:replace|change|edit|respell)\s+(?:the\s+|my\s+)?(?:surname|last\s*name|family\s*name)$/i.test(
              cleanNameCmd,
            )
          ) {
            const parts = pendingNameCandidateRef.current.trim().split(/\s+/).filter(Boolean);
            const keptFirst = parts[0] || "";
            pendingNameCandidateRef.current = null;
            spelledFirstNameBufferRef.current = keptFirst;
            spelledSurnameBufferRef.current = "";
            regFieldPhaseRef.current = "spelling_surname";
            const formattedFirst = formatTitleWord(keptFirst);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: {
                  intent: "spelling_name_progress",
                  extractedName: formattedFirst,
                  nextStep: 2,
                },
              }),
            );
            speak(
              `Keeping first name ${formatSpelledLettersForTts(keptFirst)}. Now spell your surname, one letter at a time. Say done when finished, or say skip if you have no surname.`,
              true,
            );
            return;
          }

          if (/^(?:repeat|say again|read back|read name)$/i.test(cleanNameCmd)) {
            const readback = formatNameForReadback(pendingNameCandidateRef.current);
            speak(
              `I recorded ${readback}. Say confirm if this is right, replace first name, replace surname, or restart.`,
              true,
            );
            return;
          }

          if (
            interpreted.intent === "cancel" ||
            interpreted.intent === "change_name" ||
            interpreted.intent === "change_current" ||
            isNegativePhrase(text) ||
            isSpellingTrigger(text) ||
            /^(?:restart|spell again|start over|change|change it)$/i.test(cleanNameCmd)
          ) {
            pendingNameCandidateRef.current = null;
            spelledFirstNameBufferRef.current = "";
            spelledSurnameBufferRef.current = "";
            pendingLastLetterRetryRef.current = null;
            regFieldPhaseRef.current = "spelling_first_name";
            const msg =
              "Cleared name. Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname.";
            speak(msg, true);
            window.dispatchEvent(
              new CustomEvent("voxonix:voice-input", {
                detail: { intent: "reset_name", spokenResponse: msg, nextStep: 2 },
              }),
            );
            return;
          }

          const readback = formatNameForReadback(pendingNameCandidateRef.current);
          speak(
            `Please say confirm for ${readback}, replace first name, replace surname, or restart.`,
            true,
          );
          return;
        }

        const emitNameSpellingProgress = (rawFirst: string, rawSurname: string) => {
          const preview = [formatTitleWord(rawFirst), formatMultiWordTitle(rawSurname)]
            .filter(Boolean)
            .join(" ");
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "spelling_name_progress",
                extractedName: preview,
                nextStep: 2,
              },
            }),
          );
        };

        const combineSurnameSegment = (
          existing: string,
          addedBefore: string,
          addedAfter?: string,
          didSeeSpace?: boolean,
        ) => {
          if (didSeeSpace) {
            const firstSeg = existing + addedBefore;
            return [firstSeg.trim(), (addedAfter || "").trim()]
              .filter(Boolean)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
          }
          return (existing + addedBefore).replace(/\s+/g, " ");
        };

        const speakLastLetterRetryPrompt = (
          scope: "first_name" | "surname",
          recognizedLetters: string,
          invalidToken?: string,
          fallbackError?: string,
        ) => {
          const wasRetrying = pendingLastLetterRetryRef.current === scope;
          pendingLastLetterRetryRef.current = scope;
          if (recognizedLetters) {
            if (wasRetrying && invalidToken === "and") {
              speak(
                `I recognised ${formatSpelledLettersForTts(recognizedLetters)}, and heard "and". Please say the letter N, or say repeat letter, backspace, continue, or done.`,
                true,
              );
              return;
            }
            speak(
              `I recognised ${formatSpelledLettersForTts(recognizedLetters)}. Please repeat the last letter.`,
              true,
            );
            return;
          }
          const suffix =
            scope === "first_name"
              ? "Please spell one letter at a time, say backspace to undo, or say done when you finish your first name."
              : "Spell your surname one letter at a time, say backspace to undo, or say done.";
          speak(`${fallbackError || "Unable to recognise that letter."} ${suffix}`, true);
        };

        if (regFieldPhaseRef.current === "spelling_first_name") {
          if (/^(?:restart|start over|spell again)$/i.test(cleanNameCmd)) {
            spelledFirstNameBufferRef.current = "";
            spelledSurnameBufferRef.current = "";
            pendingLastLetterRetryRef.current = null;
            emitNameSpellingProgress("", "");
            speak(
              "Restarted name spelling. Please spell your first name by saying each letter separately.",
              true,
            );
            return;
          }

          const res = parseSpelledWordLetters(text);
          if (!res.valid) {
            if (res.letters) {
              spelledFirstNameBufferRef.current += res.letters;
            }
            if (res.sawSpace && spelledFirstNameBufferRef.current) {
              if (res.trailingLetters) {
                spelledSurnameBufferRef.current = combineSurnameSegment(
                  spelledSurnameBufferRef.current,
                  res.trailingLetters,
                );
              }
              regFieldPhaseRef.current = "spelling_surname";
              emitNameSpellingProgress(
                spelledFirstNameBufferRef.current,
                spelledSurnameBufferRef.current,
              );
              const recognized = [
                spelledFirstNameBufferRef.current,
                spelledSurnameBufferRef.current,
              ]
                .filter(Boolean)
                .join(" ");
              speakLastLetterRetryPrompt("surname", recognized, res.invalidToken, res.error);
              return;
            }
            const cur = spelledFirstNameBufferRef.current;
            emitNameSpellingProgress(cur, spelledSurnameBufferRef.current);
            speakLastLetterRetryPrompt("first_name", cur, res.invalidToken, res.error);
            return;
          }

          if (res.controlAction === "repeat_letter") {
            const cur = spelledFirstNameBufferRef.current;
            pendingLastLetterRetryRef.current = "first_name";
            speak(
              cur
                ? `I recognised ${formatSpelledLettersForTts(cur)}. Please repeat the last letter.`
                : "First name buffer is empty. Spell your first name letter by letter.",
              true,
            );
            return;
          }

          if (res.controlAction === "continue") {
            pendingLastLetterRetryRef.current = null;
            const cur = spelledFirstNameBufferRef.current;
            speak(
              cur
                ? `Continuing with first name ${formatSpelledLettersForTts(cur)}. Keep spelling, say done for surname, or say backspace to undo.`
                : "First name is still empty. Please spell your first name letter by letter.",
              true,
            );
            return;
          }

          pendingLastLetterRetryRef.current = null;

          if (res.controlAction === "backspace") {
            spelledFirstNameBufferRef.current = spelledFirstNameBufferRef.current.slice(0, -1);
            const cur = spelledFirstNameBufferRef.current;
            emitNameSpellingProgress(cur, spelledSurnameBufferRef.current);
            speak(
              cur
                ? `First name letters: ${formatSpelledLettersForTts(cur)}. Keep spelling or say done for surname.`
                : "First name buffer is empty. Spell your first name letter by letter.",
              true,
            );
            return;
          }

          if (res.controlAction === "clear") {
            spelledFirstNameBufferRef.current = "";
            emitNameSpellingProgress("", spelledSurnameBufferRef.current);
            speak("Cleared first name. Please spell your first name letter by letter.", true);
            return;
          }

          if (res.sawSpace) {
            const combinedFirst = spelledFirstNameBufferRef.current + res.letters;
            if (!combinedFirst) {
              speak(
                "Please spell at least one letter of your first name before saying space.",
                true,
              );
              return;
            }
            spelledFirstNameBufferRef.current = combinedFirst;
            if (res.trailingLetters) {
              const existingSurname = spelledSurnameBufferRef.current;
              spelledSurnameBufferRef.current = existingSurname
                ? `${existingSurname} ${res.trailingLetters}`.replace(/\s+/g, " ").trim()
                : res.trailingLetters;
            }
            const curSurname = spelledSurnameBufferRef.current;
            if (res.controlAction === "done" && curSurname) {
              finalizeSpelledNameCandidate(combinedFirst, curSurname);
              return;
            }
            regFieldPhaseRef.current = "spelling_surname";
            emitNameSpellingProgress(combinedFirst, curSurname);
            if (curSurname) {
              speak(
                `Space added. First name is ${formatTitleWord(combinedFirst)}. Surname letters: ${formatSpelledLettersForTts(curSurname)}. Keep spelling your surname, or say done.`,
                true,
              );
            } else {
              speak(
                `Space added after ${formatTitleWord(combinedFirst)}. Now spell your surname, one letter at a time. Say done when finished, or say skip if you have no surname.`,
                true,
              );
            }
            return;
          }

          if (!res.letters && (res.controlAction === "next" || res.controlAction === "done")) {
            if (!spelledFirstNameBufferRef.current) {
              speak("First name is still empty. Please spell your first name first.", true);
              return;
            }
            if (res.controlAction === "done" && spelledSurnameBufferRef.current) {
              finalizeSpelledNameCandidate(
                spelledFirstNameBufferRef.current,
                spelledSurnameBufferRef.current,
              );
              return;
            }
            regFieldPhaseRef.current = "spelling_surname";
            const firstFormatted = formatTitleWord(spelledFirstNameBufferRef.current);
            speak(
              `First name recorded as ${firstFormatted}. Now spell your surname, one letter at a time. Say done when finished, or say skip if you have no surname.`,
              true,
            );
            return;
          }

          spelledFirstNameBufferRef.current += res.letters;
          const curFirst = spelledFirstNameBufferRef.current;
          const formattedFirst = formatTitleWord(curFirst);
          emitNameSpellingProgress(curFirst, spelledSurnameBufferRef.current);
          if (res.controlAction === "done" && spelledSurnameBufferRef.current) {
            finalizeSpelledNameCandidate(curFirst, spelledSurnameBufferRef.current);
          } else if (res.controlAction === "next" || res.controlAction === "done") {
            regFieldPhaseRef.current = "spelling_surname";
            speak(
              `First name recorded as ${formattedFirst}. Now spell your surname, one letter at a time. Say done when finished, or say skip if you have no surname.`,
              true,
            );
          } else {
            speak(
              `First name letters: ${formatSpelledLettersForTts(curFirst)}. Continue spelling, say done for surname, or say backspace to undo.`,
              true,
            );
          }
          return;
        }

        if (regFieldPhaseRef.current === "spelling_surname") {
          if (
            /^(?:replace|change|edit|respell)\s+(?:the\s+|my\s+)?(?:first\s*name|given\s*name)$/i.test(
              cleanNameCmd,
            )
          ) {
            spelledFirstNameBufferRef.current = "";
            pendingLastLetterRetryRef.current = null;
            regFieldPhaseRef.current = "spelling_first_name";
            emitNameSpellingProgress("", spelledSurnameBufferRef.current);
            speak(
              "Cleared first name while keeping your surname. Please spell your first name one letter at a time, then say done.",
              true,
            );
            return;
          }

          if (
            /^(?:confirm|yes|yeah|yep|correct)$/i.test(cleanNameCmd) &&
            spelledSurnameBufferRef.current
          ) {
            pendingLastLetterRetryRef.current = null;
            finalizeSpelledNameCandidate(
              spelledFirstNameBufferRef.current,
              spelledSurnameBufferRef.current,
            );
            return;
          }

          if (/^(?:restart|start over|spell again)$/i.test(cleanNameCmd)) {
            spelledFirstNameBufferRef.current = "";
            spelledSurnameBufferRef.current = "";
            pendingLastLetterRetryRef.current = null;
            regFieldPhaseRef.current = "spelling_first_name";
            emitNameSpellingProgress("", "");
            speak(
              "Restarted name spelling. Please spell your first name by saying each letter separately.",
              true,
            );
            return;
          }

          const res = parseSpelledWordLetters(text);
          if (!res.valid) {
            if (res.letters || res.trailingLetters) {
              spelledSurnameBufferRef.current = combineSurnameSegment(
                spelledSurnameBufferRef.current,
                res.letters,
                res.trailingLetters,
                res.sawSpace,
              );
            }
            const cur = spelledSurnameBufferRef.current;
            emitNameSpellingProgress(spelledFirstNameBufferRef.current, cur);
            speakLastLetterRetryPrompt("surname", cur, res.invalidToken, res.error);
            return;
          }

          if (res.controlAction === "repeat_letter") {
            const cur = spelledSurnameBufferRef.current;
            pendingLastLetterRetryRef.current = "surname";
            speak(
              cur
                ? `I recognised ${formatSpelledLettersForTts(cur)}. Please repeat the last letter.`
                : "Surname buffer is empty. Spell your surname letter by letter, or say skip.",
              true,
            );
            return;
          }

          if (res.controlAction === "continue") {
            pendingLastLetterRetryRef.current = null;
            const cur = spelledSurnameBufferRef.current;
            speak(
              cur
                ? `Continuing with surname ${formatSpelledLettersForTts(cur)}. Keep spelling, say done when finished, or say backspace to undo.`
                : "Surname buffer is empty. Spell your surname letter by letter, or say skip.",
              true,
            );
            return;
          }

          pendingLastLetterRetryRef.current = null;

          if (res.controlAction === "backspace") {
            spelledSurnameBufferRef.current = spelledSurnameBufferRef.current
              .slice(0, -1)
              .trimEnd();
            emitNameSpellingProgress(
              spelledFirstNameBufferRef.current,
              spelledSurnameBufferRef.current,
            );
            speak(
              spelledSurnameBufferRef.current
                ? `Surname letters: ${formatSpelledLettersForTts(spelledSurnameBufferRef.current)}. Keep spelling or say done.`
                : "Surname buffer is empty. Spell your surname or say skip.",
              true,
            );
            return;
          }

          if (res.controlAction === "clear") {
            spelledSurnameBufferRef.current = "";
            emitNameSpellingProgress(spelledFirstNameBufferRef.current, "");
            speak("Cleared surname. Spell your surname letter by letter, or say skip.", true);
            return;
          }

          if (res.controlAction === "skip") {
            finalizeSpelledNameCandidate(spelledFirstNameBufferRef.current, "");
            return;
          }

          if (
            res.controlAction === "done" ||
            res.controlAction === "next" ||
            isAffirmativePhrase(text)
          ) {
            if (!spelledSurnameBufferRef.current && !res.letters && !res.trailingLetters) {
              finalizeSpelledNameCandidate(spelledFirstNameBufferRef.current, "");
              return;
            }
          }

          const updatedSurname = combineSurnameSegment(
            spelledSurnameBufferRef.current,
            res.letters,
            res.trailingLetters,
            res.sawSpace,
          );
          spelledSurnameBufferRef.current = updatedSurname;

          if (res.controlAction === "done" || res.controlAction === "next") {
            finalizeSpelledNameCandidate(spelledFirstNameBufferRef.current, updatedSurname);
          } else {
            emitNameSpellingProgress(spelledFirstNameBufferRef.current, updatedSurname);
            speak(
              `Surname letters: ${formatSpelledLettersForTts(updatedSurname)}. Keep spelling, say backspace to undo, or say done to confirm your name.`,
              true,
            );
          }
          return;
        }

        // Defensive fallback if phase ever is listening_name -> transition or decode ordinary spelling
        spelledFirstNameBufferRef.current = "";
        spelledSurnameBufferRef.current = "";
        regFieldPhaseRef.current = "spelling_first_name";
        const fullSpelled = parseSpelledName(text);
        if (fullSpelled.valid) {
          const parts = fullSpelled.name.split(" ");
          finalizeSpelledNameCandidate(parts[0] || "", parts.slice(1).join(" "));
          return;
        }
        const directEmail = normalizeSpokenEmail(text);
        if (directEmail.valid) {
          speak(
            "That sounded like an email address. Step 2 is for your full name. Please spell your first name by saying each letter separately.",
            true,
          );
          return;
        }
        const nameRes = extractSpokenName(text);
        if (nameRes.valid) {
          pendingNameCandidateRef.current = nameRes.name;
          regFieldPhaseRef.current = "confirming_name";
          const readback = formatNameForReadback(nameRes.name);
          const confirmMsg = `I heard ${readback}. Say confirm if this is right, replace first name, replace surname, or restart.`;
          speak(confirmMsg, true);
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: "candidate_name",
                candidateName: nameRes.name,
                extractedName: nameRes.name,
                spokenResponse: confirmMsg,
                nextStep: 2,
              },
            }),
          );
          return;
        }
        speak(
          "Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish.",
          true,
        );
        return;
      }

      // 5. Step 3: Email Dictation, Confirmation Readback, and Character-by-Character Spelling (/register)
      if (currentRoute === "/register" && currentStep === 3) {
        handleSharedEmailCaptureStep("register", text, interpreted.intent);
        return;
      }

      // 6. Deterministic command execution
      if (interpreted.intent === "read_page") {
        speak(summarizeCurrentPageText(), true);
        return;
      }

      if (interpreted.intent === "read_current_field") {
        speak(readFocusedFieldSummary(), true);
        return;
      }

      if (interpreted.intent === "scroll") {
        if (typeof window !== "undefined") {
          window.scrollBy({
            top: interpreted.scrollDirection === "up" ? -480 : 480,
            behavior: "smooth",
          });
        }
        speak(interpreted.spokenResponse, true);
        return;
      }

      if (interpreted.intent === "go_back") {
        speak(interpreted.spokenResponse, true);
        if (typeof window !== "undefined") {
          window.history.back();
        }
        return;
      }

      if (interpreted.intent === "open_notifications") {
        if (!isAuthenticatedRef.current) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        speak("Opening settings and notification preferences.", true);
        navigate({ to: "/settings" });
        return;
      }

      if (interpreted.intent === "navigate" && interpreted.targetRoute) {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        speak(interpreted.spokenResponse, true);
        navigate({ to: interpreted.targetRoute });
        return;
      }

      if (interpreted.intent === "select_blind") {
        void selectBlindProfileAndStart("wake");
        return;
      }

      if (interpreted.intent === "enter_name" || interpreted.intent === "change_name") {
        if (currentRoute === "/register") {
          pendingNameCandidateRef.current = null;
          spelledFirstNameBufferRef.current = "";
          spelledSurnameBufferRef.current = "";
          regFieldPhaseRef.current = "spelling_first_name";
        }
        speak(interpreted.spokenResponse, true);
        if (interpreted.validForContext) {
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: interpreted.intent === "change_name" ? "reset_name" : "enter_name",
                spokenResponse: interpreted.spokenResponse,
                nextStep: 2,
              },
            }),
          );
        }
        return;
      }

      if (interpreted.intent === "enter_email" || interpreted.intent === "change_email") {
        if (currentRoute === "/register") {
          pendingEmailCandidateRef.current = null;
          spelledEmailBufferRef.current = "";
          preservedEmailLocalRef.current = "";
          preservedEmailDomainRef.current = "";
          regFieldPhaseRef.current = "spelling_email";
        }
        speak(interpreted.spokenResponse, true);
        if (interpreted.validForContext) {
          window.dispatchEvent(
            new CustomEvent("voxonix:voice-input", {
              detail: {
                intent: interpreted.intent === "change_email" ? "reset_email" : "enter_email",
                spokenResponse: interpreted.spokenResponse,
                nextStep: 3,
              },
            }),
          );
        }
        return;
      }

      if (interpreted.intent === "enter_password_guidance") {
        speak(interpreted.spokenResponse, true);
        if (interpreted.validForContext) {
          if (currentRoute === "/register") {
            passwordDraftBufferRef.current = "";
            confirmPasswordDraftBufferRef.current = "";
            regFieldPhaseRef.current = "listening_password";
          }
          const target = document.getElementById(
            currentRoute === "/login" ? "login-password" : "reg-password",
          );
          target?.focus();
        }
        return;
      }

      if (interpreted.intent === "continue_step") {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        if (currentRoute === "/register") {
          if (currentStep === 2 && !pendingNameCandidateRef.current) {
            speak(
              "Please spell your first name and surname, then confirm your full name before continuing to Step 3.",
              true,
            );
            return;
          }
          if (currentStep === 3 && !pendingEmailCandidateRef.current) {
            speak(
              "Please spell your email address and confirm it before continuing to Step 4.",
              true,
            );
            return;
          }
        }
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "continue_step", spokenResponse: interpreted.spokenResponse },
          }),
        );
        return;
      }

      if (interpreted.intent === "submit") {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        if (currentRoute === "/register" && currentStep === 5) {
          executeConfirmedAction("submit_registration");
          return;
        }
        if (interpreted.requiresConfirmation && interpreted.confirmationPrompt) {
          const conf: PendingConfirmationState = {
            action: "submit_registration",
            prompt: interpreted.confirmationPrompt,
          };
          setPendingConfirmation(conf);
          pendingConfirmationRef.current = conf;
          speak(interpreted.confirmationPrompt, true);
          return;
        }
        speak(interpreted.spokenResponse, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:voice-input", {
            detail: { intent: "submit", spokenResponse: interpreted.spokenResponse },
          }),
        );
        return;
      }

      if (interpreted.intent === "logout") {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        const conf: PendingConfirmationState = {
          action: "logout",
          prompt: interpreted.confirmationPrompt || "Log out of VOXONIX? Say confirm or cancel.",
        };
        setPendingConfirmation(conf);
        pendingConfirmationRef.current = conf;
        speak(conf.prompt, true);
        return;
      }

      if (interpreted.intent === "end_call") {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        const conf: PendingConfirmationState = {
          action: "end_call",
          prompt: interpreted.confirmationPrompt || "End this call? Say confirm or cancel.",
        };
        setPendingConfirmation(conf);
        pendingConfirmationRef.current = conf;
        speak(conf.prompt, true);
        return;
      }

      if (interpreted.intent === "start_call") {
        if (!interpreted.validForContext) {
          speak(interpreted.spokenResponse, true);
          return;
        }
        speak(interpreted.spokenResponse, true);
        if (currentRoute !== "/dashboard") {
          navigate({ to: "/dashboard" });
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("voxonix:dashboard-action", { detail: { action: "start_call" } }),
            );
          }, 200);
        } else {
          window.dispatchEvent(
            new CustomEvent("voxonix:dashboard-action", { detail: { action: "start_call" } }),
          );
        }
        return;
      }

      if (interpreted.callAction) {
        speak(interpreted.spokenResponse, true);
        window.dispatchEvent(
          new CustomEvent("voxonix:call-action", { detail: { action: interpreted.callAction } }),
        );
        return;
      }

      if (interpreted.spokenResponse) {
        speak(interpreted.spokenResponse, true);
      } else {
        speak("I did not understand that. Say repeat or help to hear options.", true);
      }
    },
    [
      abortInFlightStt,
      cancelPendingAction,
      cancelSpeech,
      clearAllLoginBuffers,
      clearAllRegistrationBuffers,
      clearLoginConfirmTimer,
      confirmPendingAction,
      disableVoiceGuidance,
      executeConfirmedAction,
      handleSharedEmailCaptureStep,
      handleSharedPasswordCaptureStep,
      isUserEligibleForBlindVoice,
      lockOutBlindForSession,
      navigate,
      pauseListening,
      repeatLastSpoken,
      selectBlindProfileAndStart,
      speak,
      speakLoginSubmitPrompt,
      startBlindVoiceLogin,
    ],
  );

  handleRecognizedTranscriptRef.current = handleRecognizedTranscript;

  /**
   * Sends completed speech segments strictly to Gnani Prisma v3.0 (`/api/ai/gnani/transcribe`).
   * Runs either in narrow pre-selection wake-word mode (`purpose: "wake"`) OR in authorized
   * Blind registration / Blind dashboard mode. Zero transcripts or passwords are logged or stored.
   */
  const dispatchUtteranceToGnani = useCallback(
    (utterance: { audio: Float32Array; meanRms: number; peakRms: number }) => {
      if (isPausedRef.current || isCompletingLoginSuccessRef.current) return;

      if (
        pathnameRef.current === "/login" &&
        (isSubmittingLoginRef.current || loginFieldPhaseRef.current === "submitting_login")
      ) {
        return;
      }

      if (
        pathnameRef.current === "/" &&
        (onboardingStateRef.current === "wake_detected" ||
          onboardingStateRef.current === "transitioning_register" ||
          onboardingStateRef.current === "transitioning_login")
      ) {
        return;
      }

      const isOnboardingChoice =
        onboardingStateRef.current === "awaiting_auth_intent" &&
        !wakeModeRef.current &&
        !isAuthenticatedRef.current &&
        !isLockedOutForSessionRef.current &&
        pathnameRef.current === "/";

      const isRestrictedWake =
        onboardingStateRef.current === "idle" &&
        wakeModeRef.current &&
        !isAuthenticatedRef.current &&
        !isLockedOutForSessionRef.current &&
        !isVoiceGuideActiveRef.current &&
        (pathnameRef.current === "/" ||
          (pathnameRef.current === "/register" && !getRegisterDomSelectedProfile()));

      if (!isRestrictedWake && !isOnboardingChoice) {
        if (isDeactivatedForNonBlindRef.current || !isUserEligibleForBlindVoice()) {
          return;
        }
      }

      const postTtsMs = isOnboardingChoice
        ? 600
        : pathnameRef.current === "/login" &&
            loginFieldPhaseRef.current === "confirming_login_submit"
          ? 250
          : 450;

      if (isSpeakingRef.current || Date.now() - ttsEndedAtRef.current < postTtsMs) {
        return;
      }

      const stepAttr = document
        .querySelector("[data-registration-step]")
        ?.getAttribute("data-registration-step");
      const currentRegStep = stepAttr ? parseInt(stepAttr, 10) : 1;

      const isAuthorizedVoicePasswordPhase =
        pathnameRef.current === "/register" ||
        (pathnameRef.current === "/login" &&
          isVoiceGuideActiveRef.current &&
          loginFieldPhaseRef.current === "listening_login_password");

      const isAuthorizedLoginCommandPhase =
        pathnameRef.current === "/login" &&
        isVoiceGuideActiveRef.current &&
        loginFieldPhaseRef.current === "confirming_login_submit";

      if (
        !isRestrictedWake &&
        !isOnboardingChoice &&
        !isAuthorizedVoicePasswordPhase &&
        !isAuthorizedLoginCommandPhase &&
        isPasswordFieldFocused()
      ) {
        sttSkippedOrDeduplicatedCountRef.current++;
        return;
      }

      // Discard tiny clicks, flat silence, or sub-150ms acoustic bursts without calling Gnani STT
      if (!utterance.audio || utterance.audio.length < 2400 || utterance.peakRms < 0.014) {
        sttSkippedOrDeduplicatedCountRef.current++;
        return;
      }

      // Bounded cadence for wake-word requests (saves Gnani credits)
      const now = Date.now();
      if (isRestrictedWake && now - lastWakeSttAtRef.current < 1500) {
        sttSkippedOrDeduplicatedCountRef.current++;
        return;
      }

      // Prevent overlapping or duplicate transcriptions
      if (isSttInFlightRef.current) {
        sttSkippedOrDeduplicatedCountRef.current++;
        return;
      }

      const activePhase =
        pathnameRef.current === "/login" ? loginFieldPhaseRef.current : regFieldPhaseRef.current;
      const purpose = isRestrictedWake
        ? "wake"
        : isOnboardingChoice
          ? "onboarding_choice"
          : pathnameRef.current === "/login"
            ? activePhase === "spelling_login_email"
              ? "login_email_spelling"
              : activePhase === "listening_login_email"
                ? "login_email"
                : activePhase === "listening_login_password"
                  ? "login_password_spelling"
                  : "login_command"
            : pathnameRef.current === "/register"
              ? currentRegStep === 2
                ? activePhase === "confirming_name"
                  ? "command"
                  : activePhase === "spelling_first_name" || activePhase === "spelling_surname"
                    ? "name_spelling"
                    : "name"
                : currentRegStep === 3
                  ? activePhase === "confirming_email"
                    ? "command"
                    : activePhase === "spelling_email"
                      ? "email_spelling"
                      : "email"
                  : currentRegStep === 4
                    ? activePhase === "listening_confirm_password"
                      ? "confirm_password_spelling"
                      : activePhase === "listening_password"
                        ? "password_spelling"
                        : "command"
                    : "command"
              : "command";

      const audioHash = hashAudioSamples(utterance.audio);
      const contextKey = `${pathnameRef.current}:${currentRegStep}:${purpose}:${activePhase}`;
      if (
        lastSttSubmissionRef.current &&
        lastSttSubmissionRef.current.hash === audioHash &&
        (lastSttSubmissionRef.current.contextKey === contextKey || isOnboardingChoice) &&
        now - lastSttSubmissionRef.current.at < 5000
      ) {
        sttSkippedOrDeduplicatedCountRef.current++;
        return;
      }
      lastSttSubmissionRef.current = { hash: audioHash, contextKey, at: now };

      const isSensitiveCapture =
        purpose === "password_spelling" ||
        purpose === "confirm_password_spelling" ||
        purpose === "login_password_spelling";

      // Build field-specific keyterms without ever polluting Name/Email with NATO words, domain bleed, or password hints
      let keyterms: string[];
      if (isRestrictedWake) {
        keyterms = ["Blind"];
      } else if (isSensitiveCapture) {
        keyterms = [];
      } else if (purpose === "onboarding_choice") {
        keyterms = ONBOARDING_CHOICE_KEYTERMS;
      } else if (purpose === "login_email_spelling" || purpose === "login_email") {
        keyterms = EMAIL_SPELLING_KEYTERMS;
      } else if (purpose === "login_command") {
        keyterms = [
          "confirm",
          "change",
          "change username",
          "change domain",
          "change password",
          "change email",
          "add more",
          "sign in",
          "sign in now",
          "please sign in",
          "log in",
          "login",
          "log me in",
          "submit",
          "repeat",
          "help",
          "go back",
          "start again",
          "cancel",
          "stop",
        ];
      } else if (purpose === "name_spelling") {
        keyterms = ALPHABET_SPELLING_KEYTERMS;
      } else if (purpose === "name") {
        keyterms = [
          "confirm",
          "change",
          "replace first name",
          "replace surname",
          "restart",
          "repeat",
          "help",
          "cancel",
          "go back",
          "start again",
        ];
      } else if (purpose === "email_spelling" || purpose === "email") {
        keyterms = EMAIL_SPELLING_KEYTERMS;
      } else {
        keyterms = [
          "VOXONIX",
          "confirm",
          "cancel",
          "change",
          "replace first name",
          "replace surname",
          "change username",
          "change domain",
          "restart",
          "repeat",
          "help",
          "submit",
          "go back",
          "start again",
          "stop",
          "continue",
        ];
      }

      if (isRestrictedWake) {
        lastWakeSttAtRef.current = now;
      }

      isSttInFlightRef.current = true;
      if (!isRestrictedWake && !isOnboardingChoice) {
        setVoiceState("processing");
      }

      const normalizedAudio = normalizeQuietUtteranceAudio(utterance.audio);
      const audioPcm16Base64 = encodeFloat32ToPcm16Base64(normalizedAudio);
      const requestOnboardingToken = onboardingCycleTokenRef.current;
      const controller = new AbortController();
      sttAbortControllerRef.current = controller;
      const timeoutId = setTimeout(
        () => controller.abort(),
        isRestrictedWake || isOnboardingChoice ? 12_000 : 18_000,
      );

      // Zero automatic retries on STT failure: prevents duplicate billing
      void fetch("/api/ai/gnani/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          audioPcm16Base64,
          sampleRate: 16000,
          languageCode: voicePreferences.language || "en-IN",
          format: "verbatim",
          purpose,
          registrationStep:
            pathnameRef.current === "/register" ? currentRegStep : isRestrictedWake ? 1 : undefined,
          keyterms,
        }),
      })
        .then(async (resp) => {
          if (!resp.ok) {
            throw new Error(`Gnani speech recognition unavailable (HTTP ${resp.status}).`);
          }
          return (await resp.json()) as { transcript?: string };
        })
        .then((data) => {
          clearTimeout(timeoutId);
          if (sttAbortControllerRef.current === controller) {
            sttAbortControllerRef.current = null;
          }
          isSttInFlightRef.current = false;

          const decoded = (data.transcript || "").trim();

          if (isRestrictedWake) {
            if (
              onboardingCycleTokenRef.current !== requestOnboardingToken ||
              onboardingStateRef.current !== "idle" ||
              !wakeModeRef.current ||
              isLockedOutForSessionRef.current ||
              isAuthenticatedRef.current
            ) {
              return;
            }
            if (decoded && isWakeWordBlind(decoded)) {
              if (pathnameRef.current === "/") {
                const wakeToken = ++onboardingCycleTokenRef.current;
                wakeModeRef.current = false;
                setSyncOnboardingState("wake_detected");
                isDeactivatedForNonBlindRef.current = false;
                abortInFlightStt();
                segmenterRef.current.reset();
                lastSttSubmissionRef.current = null;
                setWakeStatus("idle");
                setLastTranscript(null);
                speak(
                  "Welcome to VOXONIX. Would you like to register a new account or sign in to your existing account? Say register or sign in.",
                  true,
                  () => {
                    if (
                      onboardingCycleTokenRef.current !== wakeToken ||
                      onboardingStateRef.current !== "wake_detected" ||
                      pathnameRef.current !== "/" ||
                      isLockedOutForSessionRef.current ||
                      isAuthenticatedRef.current
                    ) {
                      return;
                    }
                    segmenterRef.current.reset();
                    lastSttSubmissionRef.current = null;
                    setSyncOnboardingState("awaiting_auth_intent");
                    void startVoiceListeningRef.current(true, false);
                  },
                );
              } else {
                void selectBlindProfileRef.current("wake");
              }
            }
            return;
          }

          if (isOnboardingChoice) {
            if (
              onboardingCycleTokenRef.current !== requestOnboardingToken ||
              onboardingStateRef.current !== "awaiting_auth_intent" ||
              pathnameRef.current !== "/" ||
              isLockedOutForSessionRef.current ||
              isAuthenticatedRef.current
            ) {
              return;
            }
            if (isSpeakingRef.current || Date.now() - ttsEndedAtRef.current < 450) return;
            if (!decoded) {
              speak(
                "Welcome to VOXONIX. Would you like to register a new account or sign in to your existing account? Say register or sign in.",
                true,
              );
              return;
            }
            void handleRecognizedTranscriptRef.current(decoded);
            return;
          }

          setAssistantError(null);
          if (isListeningRef.current && hasLiveAudioTrack(micStreamRef.current)) {
            setVoiceState("listening");
          } else {
            setVoiceState(isPausedRef.current ? "paused" : "disabled");
          }

          if (
            isCompletingLoginSuccessRef.current ||
            (pathnameRef.current === "/login" &&
              (isSubmittingLoginRef.current || loginFieldPhaseRef.current === "submitting_login"))
          ) {
            return;
          }
          if (isDeactivatedForNonBlindRef.current || !isUserEligibleForBlindVoice()) return;
          if (isSpeakingRef.current || Date.now() - ttsEndedAtRef.current < postTtsMs) return;
          if (!decoded) return;

          if (isSensitiveCapture) {
            setLastTranscript(null);
          } else {
            setLastTranscript(decoded);
          }
          void handleRecognizedTranscriptRef.current(decoded);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          if (sttAbortControllerRef.current === controller) {
            sttAbortControllerRef.current = null;
          }
          isSttInFlightRef.current = false;
          if (isRestrictedWake) {
            return;
          }
          if (isOnboardingChoice) {
            if (
              onboardingCycleTokenRef.current === requestOnboardingToken &&
              onboardingStateRef.current === "awaiting_auth_intent" &&
              pathnameRef.current === "/"
            ) {
              speak("I could not hear that clearly. Say register or sign in.", true);
            }
            return;
          }
          if (isDeactivatedForNonBlindRef.current || !isVoiceGuideActiveRef.current) {
            setVoiceState("disabled");
            return;
          }
          if (
            pathnameRef.current === "/login" &&
            loginFieldPhaseRef.current === "confirming_login_submit" &&
            !isSubmittingLoginRef.current &&
            !isCompletingLoginSuccessRef.current
          ) {
            // Preserve confirmed email and captured password; never submit on STT error/timeout
            if (isListeningRef.current && hasLiveAudioTrack(micStreamRef.current)) {
              setVoiceState("listening");
            }
            speakLoginSubmitPrompt("stt_error", loginPasswordDraftRef.current.length);
            return;
          }
          setAssistantError(
            "Speech recognition (Gnani Prisma) is temporarily unavailable. You can use the accessible form controls or try again.",
          );
          setVoiceState("error");
        });
    },
    [
      abortInFlightStt,
      isUserEligibleForBlindVoice,
      setSyncOnboardingState,
      speak,
      speakLoginSubmitPrompt,
      voicePreferences.language,
    ],
  );

  const startVoiceListening = useCallback(
    async (userInitiated = false, wakeOnly = false): Promise<boolean> => {
      if (typeof window === "undefined") return false;

      const canRunWake =
        wakeOnly &&
        !isAuthenticatedRef.current &&
        !isLockedOutForSessionRef.current &&
        ((pathnameRef.current === "/" && onboardingStateRef.current === "idle") ||
          (pathnameRef.current === "/register" && !getRegisterDomSelectedProfile()));

      if (!canRunWake && !isUserEligibleForBlindVoice()) {
        return false;
      }

      if (
        !canRunWake &&
        !userInitiated &&
        (isManuallyPausedRef.current || !voiceGuidanceEnabledRef.current)
      ) {
        return false;
      }

      if (userInitiated && !canRunWake) {
        isManuallyPausedRef.current = false;
        setIsPaused(false);
        isPausedRef.current = false;
        isDeactivatedForNonBlindRef.current = false;
        setAssistantError(null);
      }

      wakeModeRef.current = canRunWake;

      if (hasLiveAudioTrack(micStreamRef.current) && captureHandleRef.current) {
        await captureHandleRef.current.resumeIfSuspended();
        setIsListening(true);
        isListeningRef.current = true;
        if (canRunWake) {
          setWakeStatus("listening");
          setVoiceState("disabled");
        } else {
          setWakeStatus("idle");
          setVoiceState(isSpeakingRef.current ? "speaking" : "listening");
        }
        return true;
      }

      if (isStartingPipelineRef.current) return false;
      isStartingPipelineRef.current = true;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setIsSpeechSupported(false);
          setWakeStatus("device_unavailable");
          setVoiceState("device_unavailable");
          if (!canRunWake) {
            setAssistantError("Browser microphone API is unavailable.");
          }
          return false;
        }

        let currentPerm: "granted" | "denied" | "prompt" | "unknown" = micPermissionRef.current;
        if (navigator.permissions?.query) {
          if (!canRunWake) setVoiceState("checking_permission");
          try {
            const status = await navigator.permissions.query({
              name: "microphone" as PermissionName,
            });
            currentPerm = status.state as "granted" | "denied" | "prompt";
            micPermissionRef.current = currentPerm;
            setMicPermission(currentPerm);
          } catch {
            // Partial Permissions API implementations
          }
        }

        if (currentPerm === "denied" && !userInitiated) {
          setWakeStatus("permission_denied");
          stopAudioPipeline("permission_denied");
          return false;
        }

        if (canRunWake && currentPerm === "denied") {
          setWakeStatus("permission_denied");
          stopAudioPipeline("disabled");
          return false;
        }

        if (!canRunWake && !userInitiated && currentPerm !== "granted") {
          setVoiceState("paused");
          setAssistantError(
            "Browser microphone permission has not been granted yet. Select Blind mode and allow microphone access.",
          );
          return false;
        }

        if (canRunWake) {
          setWakeStatus("requesting_permission");
        } else {
          setVoiceState("requesting_permission");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        });

        // Abort safely if route changed or user locked out while awaiting native prompt
        if (
          (canRunWake &&
            (isLockedOutForSessionRef.current ||
              isAuthenticatedRef.current ||
              (pathnameRef.current !== "/" && pathnameRef.current !== "/register"))) ||
          (!canRunWake && !isUserEligibleForBlindVoice())
        ) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }

        const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
        if (liveTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          setWakeStatus("device_unavailable");
          setVoiceState("device_unavailable");
          if (!canRunWake) setAssistantError("No live microphone track found.");
          return false;
        }

        micPermissionRef.current = "granted";
        setMicPermission("granted");
        micStreamRef.current = stream;
        setHasAudioStream(true);
        setActiveTrackCount(liveTracks.length);

        liveTracks.forEach((track) => {
          track.onended = () => {
            if (wakeModeRef.current || isUserEligibleForBlindVoice()) {
              setHasAudioStream(false);
              setActiveTrackCount(0);
              setIsListening(false);
              isListeningRef.current = false;
              setWakeStatus("device_unavailable");
              if (!wakeModeRef.current) {
                setAssistantError("Microphone disconnected. Click Resume Mic once reconnected.");
                setVoiceState("device_unavailable");
              }
            }
          };
        });

        const captureHandle = await createLocalAudioCapturePipeline(stream, segmenterRef.current, {
          shouldIgnoreAudio: () => {
            if (isCompletingLoginSuccessRef.current) {
              return true;
            }
            if (
              pathnameRef.current === "/login" &&
              (isSubmittingLoginRef.current || loginFieldPhaseRef.current === "submitting_login")
            ) {
              return true;
            }
            if (
              pathnameRef.current === "/" &&
              (onboardingStateRef.current === "wake_detected" ||
                onboardingStateRef.current === "transitioning_register" ||
                onboardingStateRef.current === "transitioning_login")
            ) {
              return true;
            }
            const postTtsMs =
              onboardingStateRef.current === "awaiting_auth_intent"
                ? 600
                : pathnameRef.current === "/login" &&
                    loginFieldPhaseRef.current === "confirming_login_submit"
                  ? 250
                  : 450;
            if (
              isPausedRef.current ||
              isSpeakingRef.current ||
              Date.now() - ttsEndedAtRef.current < postTtsMs
            ) {
              return true;
            }
            if (wakeModeRef.current) {
              return isLockedOutForSessionRef.current || isAuthenticatedRef.current;
            }
            if (isDeactivatedForNonBlindRef.current || !isUserEligibleForBlindVoice()) {
              return true;
            }
            const isAuthorizedVoicePasswordPhase =
              pathnameRef.current === "/register" ||
              (pathnameRef.current === "/login" &&
                isVoiceGuideActiveRef.current &&
                loginFieldPhaseRef.current === "listening_login_password");
            const isAuthorizedLoginCommandPhase =
              pathnameRef.current === "/login" &&
              isVoiceGuideActiveRef.current &&
              loginFieldPhaseRef.current === "confirming_login_submit";
            if (
              !isAuthorizedVoicePasswordPhase &&
              !isAuthorizedLoginCommandPhase &&
              isPasswordFieldFocused()
            ) {
              return true;
            }
            return false;
          },
          isActiveAssistantMode: () =>
            (isVoiceGuideActiveRef.current ||
              onboardingStateRef.current === "awaiting_auth_intent") &&
            !wakeModeRef.current,
          getSegmenterOptions: getDynamicSegmenterOptions,
          onVolume: (rms) => {
            if (wakeModeRef.current || onboardingStateRef.current !== "idle") return;
            const now = Date.now();
            if (now - lastVolumeUiUpdateRef.current >= 200) {
              const quantized = Math.round(rms * 20) / 20;
              if (Math.abs(quantized - lastQuantizedVolumeRef.current) >= 0.05) {
                lastQuantizedVolumeRef.current = quantized;
                lastVolumeUiUpdateRef.current = now;
                setVolumeLevel(quantized);
                setIsLoudEnough(rms >= LOUD_VOICE_RMS_THRESHOLD);
              }
            }
          },
          onUtterance: (utterance) => {
            dispatchUtteranceToGnani(utterance);
          },
        });

        captureHandleRef.current = captureHandle;
        setIsListening(true);
        isListeningRef.current = true;
        if (canRunWake) {
          setWakeStatus("listening");
          setVoiceState("disabled");
        } else {
          setWakeStatus("idle");
          setAssistantError(null);
          setVoiceState(isSpeakingRef.current ? "speaking" : "listening");
        }
        return true;
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          micPermissionRef.current = "denied";
          setMicPermission("denied");
          setWakeStatus("permission_denied");
          if (!canRunWake) {
            setAssistantError(
              "Microphone permission was denied. Enable microphone access in your browser settings.",
            );
            stopAudioPipeline("permission_denied");
          } else {
            stopAudioPipeline("disabled");
          }
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setWakeStatus("device_unavailable");
          if (!canRunWake) {
            setAssistantError("No microphone device found.");
            stopAudioPipeline("device_unavailable");
          } else {
            stopAudioPipeline("disabled");
          }
        } else {
          setWakeStatus("device_unavailable");
          if (!canRunWake) {
            setAssistantError(
              err instanceof Error ? err.message : "Failed to initialize microphone.",
            );
            stopAudioPipeline("error");
          } else {
            stopAudioPipeline("disabled");
          }
        }
        return false;
      } finally {
        isStartingPipelineRef.current = false;
      }
    },
    [
      dispatchUtteranceToGnani,
      getDynamicSegmenterOptions,
      isUserEligibleForBlindVoice,
      stopAudioPipeline,
    ],
  );

  startVoiceListeningRef.current = startVoiceListening;

  const retryWakePermission = useCallback(async (): Promise<boolean> => {
    if (isAuthenticatedRef.current || isLockedOutForSessionRef.current) return false;
    setAssistantError(null);
    micPermissionRef.current = "prompt";
    setMicPermission("prompt");
    return startVoiceListening(true, true);
  }, [startVoiceListening]);

  const enableVoiceGuidance = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    if (!isUserEligibleForBlindVoice()) return false;
    if (pathnameRef.current === "/register" && !isAuthenticatedRef.current) {
      await selectBlindProfileAndStart("visual");
      return isVoiceGuideActiveRef.current;
    }
    if (pathnameRef.current === "/login" && !isAuthenticatedRef.current) {
      await startBlindVoiceLogin();
      return isVoiceGuideActiveRef.current;
    }

    isDeactivatedForNonBlindRef.current = false;
    isManuallyPausedRef.current = false;

    const started = await startVoiceListening(true, false);
    if (started) {
      if (isAuthenticatedRef.current && authProfileRef.current === "blind") {
        try {
          localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, "true");
        } catch {
          // ignore
        }
      }
      setVoiceGuidanceEnabled(true);
      voiceGuidanceEnabledRef.current = true;
      setIsVoiceGuideActive(true);
      isVoiceGuideActiveRef.current = true;
      speak("VOXONIX voice guidance enabled. Say a navigation command or read this page.", true);
    }
    return started;
  }, [
    isUserEligibleForBlindVoice,
    selectBlindProfileAndStart,
    speak,
    startBlindVoiceLogin,
    startVoiceListening,
  ]);

  const resumeListening = useCallback(async (): Promise<boolean> => {
    if (!isUserEligibleForBlindVoice()) return false;
    isManuallyPausedRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    const resumed = await startVoiceListening(true, false);
    if (resumed) {
      if (!voiceGuidanceEnabledRef.current || !isVoiceGuideActiveRef.current) {
        if (isAuthenticatedRef.current && authProfileRef.current === "blind") {
          try {
            localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, "true");
          } catch {
            // ignore
          }
        }
        setVoiceGuidanceEnabled(true);
        voiceGuidanceEnabledRef.current = true;
        setIsVoiceGuideActive(true);
        isVoiceGuideActiveRef.current = true;
      }
      speak("Microphone listening resumed.", true);
    }
    return resumed;
  }, [isUserEligibleForBlindVoice, speak, startVoiceListening]);

  const toggleVoiceGuide = useCallback(() => {
    if (!isUserEligibleForBlindVoice()) {
      disableVoiceGuidance();
      return;
    }
    if (isVoiceGuideActiveRef.current) {
      disableVoiceGuidance();
    } else if (!isListeningRef.current) {
      void enableVoiceGuidance();
    } else {
      activateVoiceGuide("Manual toggle");
    }
  }, [activateVoiceGuide, disableVoiceGuidance, enableVoiceGuidance, isUserEligibleForBlindVoice]);

  // Initial status fetch & Permissions observer
  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoicePreferences(loadSavedPreferences());

    fetch("/api/ai/gnani/status")
      .then(async (resp) => {
        if (!resp.ok) return;
        const data = (await resp.json()) as { configured?: boolean };
        setGnaniAvailable(Boolean(data.configured));
      })
      .catch(() => {
        setGnaniAvailable(false);
      });

    setIsSpeechSupported(typeof navigator.mediaDevices?.getUserMedia === "function");

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          const state = status.state as "granted" | "denied" | "prompt";
          micPermissionRef.current = state;
          setMicPermission(state);
          if (state === "denied") {
            setWakeStatus((prev) => (prev === "locked_out" ? prev : "permission_denied"));
          }
          status.onchange = () => {
            const nextState = status.state as "granted" | "denied" | "prompt";
            micPermissionRef.current = nextState;
            setMicPermission(nextState);
            if (nextState === "denied") {
              setWakeStatus((prev) => (prev === "locked_out" ? prev : "permission_denied"));
              if (isVoiceGuideActiveRef.current) {
                setAssistantError("Browser microphone permission was revoked.");
                stopAudioPipelineRef.current("permission_denied");
              } else {
                stopAudioPipelineRef.current("disabled");
              }
            } else if (nextState === "granted") {
              if (
                !isAuthenticatedRef.current &&
                !isLockedOutForSessionRef.current &&
                !isVoiceGuideActiveRef.current &&
                onboardingStateRef.current === "idle" &&
                (pathnameRef.current === "/" ||
                  (pathnameRef.current === "/register" && !getRegisterDomSelectedProfile()))
              ) {
                void startVoiceListeningRef.current(false, true);
              } else if (
                voiceGuidanceEnabledRef.current &&
                !isManuallyPausedRef.current &&
                isUserEligibleForBlindVoice()
              ) {
                void startVoiceListeningRef.current(false, false);
              }
            }
          };
        })
        .catch(() => {});
    }
  }, [isUserEligibleForBlindVoice]);

  // Route-aware restricted landing wake-word listener & strict cross-profile resource cleanup
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;

    const prevRoute = prevEffectPathnameRef.current;
    prevEffectPathnameRef.current = location.pathname;
    const isFreshLandingArrival = prevRoute !== "/";

    // Reset lockout when navigating back onto the landing page for a fresh onboarding start
    if (!isAuthenticated && location.pathname === "/" && isLockedOutForSessionRef.current) {
      isLockedOutForSessionRef.current = false;
      setIsLockedOutForSession(false);
      setWakeStatus("idle");
    }

    // 1. Authenticated non-Blind users: strictly disable all Blind voice features & release mic
    if (isAuthenticated && user?.user_metadata?.accessibility_profile !== "blind") {
      isDeactivatedForNonBlindRef.current = true;
      onboardingCycleTokenRef.current++;
      setSyncOnboardingState("idle");
      blindLoginPendingRef.current = false;
      setBlindLoginPending(false);
      loginFieldPhaseRef.current = "idle";
      clearAllLoginBuffers();
      setVoiceGuidanceEnabled(false);
      voiceGuidanceEnabledRef.current = false;
      setIsVoiceGuideActive(false);
      isVoiceGuideActiveRef.current = false;
      setAssistantError(null);
      setTtsError(null);
      setLastTranscript(null);
      setWakeStatus("idle");
      cancelSpeech();
      stopAudioPipeline("disabled");
      return;
    }

    // 2. Unauthenticated Landing Page (/): visually clean, auto-request permission once -> restricted wake listener
    if (!isAuthenticated && location.pathname === "/") {
      // Never wipe an active onboarding prompt/choice or route transition while still on /
      if (!isFreshLandingArrival && onboardingStateRef.current !== "idle") {
        return;
      }

      isDeactivatedForNonBlindRef.current = false;
      onboardingCycleTokenRef.current++;
      setSyncOnboardingState("idle");
      blindLoginPendingRef.current = false;
      setBlindLoginPending(false);
      loginFieldPhaseRef.current = "idle";
      clearAllLoginBuffers();
      setVoiceGuidanceEnabled(false);
      voiceGuidanceEnabledRef.current = false;
      setIsVoiceGuideActive(false);
      isVoiceGuideActiveRef.current = false;
      setAssistantError(null);
      setTtsError(null);
      setLastTranscript(null);
      regFieldPhaseRef.current = "idle";
      clearAllRegistrationBuffers();
      cancelSpeech();

      if (!hasAttemptedAutoMicRef.current && !isLockedOutForSessionRef.current) {
        hasAttemptedAutoMicRef.current = true;
        void startVoiceListening(true, true);
      } else if (
        !isLockedOutForSessionRef.current &&
        micPermissionRef.current === "granted" &&
        document.visibilityState === "visible"
      ) {
        void startVoiceListening(false, true);
      }
      return;
    }

    // 3. Unauthenticated Registration (/register): converge Path A & Path B or enforce non-Blind lockout
    if (!isAuthenticated && location.pathname === "/register") {
      setSyncOnboardingState("idle");
      const domProfile = getRegisterDomSelectedProfile();
      if (isLockedOutForSessionRef.current || (domProfile && domProfile !== "blind")) {
        isDeactivatedForNonBlindRef.current = true;
        setVoiceGuidanceEnabled(false);
        voiceGuidanceEnabledRef.current = false;
        setIsVoiceGuideActive(false);
        isVoiceGuideActiveRef.current = false;
        setAssistantError(null);
        setTtsError(null);
        setLastTranscript(null);
        cancelSpeech();
        stopAudioPipeline("disabled");
        return;
      }

      isDeactivatedForNonBlindRef.current = false;
      if (domProfile === "blind" || isVoiceGuideActiveRef.current) {
        wakeModeRef.current = false;
        setWakeStatus("idle");
        return;
      }

      if (micPermissionRef.current === "granted" && document.visibilityState === "visible") {
        void startVoiceListening(false, true);
      }
      return;
    }

    // 3b. Unauthenticated Login (/login): keep typed login 100% clean unless Blind Voice Login is active/pending
    if (!isAuthenticated && location.pathname === "/login") {
      setSyncOnboardingState("idle");
      if (blindLoginPendingRef.current || isVoiceGuideActiveRef.current) {
        isDeactivatedForNonBlindRef.current = false;
        wakeModeRef.current = false;
        setWakeStatus("idle");
        return;
      }

      isDeactivatedForNonBlindRef.current = true;
      setVoiceGuidanceEnabled(false);
      voiceGuidanceEnabledRef.current = false;
      setIsVoiceGuideActive(false);
      isVoiceGuideActiveRef.current = false;
      setAssistantError(null);
      setTtsError(null);
      setLastTranscript(null);
      setWakeStatus("idle");
      regFieldPhaseRef.current = "idle";
      loginFieldPhaseRef.current = "idle";
      clearAllRegistrationBuffers();
      clearAllLoginBuffers();
      cancelSpeech();
      stopAudioPipeline("disabled");
      return;
    }

    // 4. Leaving /, /register, or /login unauthenticated (e.g. /reset-password): release mic tracks & clear listeners
    if (!isAuthenticated) {
      isDeactivatedForNonBlindRef.current = true;
      onboardingCycleTokenRef.current++;
      setSyncOnboardingState("idle");
      blindLoginPendingRef.current = false;
      setBlindLoginPending(false);
      setVoiceGuidanceEnabled(false);
      voiceGuidanceEnabledRef.current = false;
      setIsVoiceGuideActive(false);
      isVoiceGuideActiveRef.current = false;
      setAssistantError(null);
      setTtsError(null);
      setLastTranscript(null);
      setWakeStatus("idle");
      regFieldPhaseRef.current = "idle";
      loginFieldPhaseRef.current = "idle";
      clearAllRegistrationBuffers();
      clearAllLoginBuffers();
      cancelSpeech();
      stopAudioPipeline("disabled");
      return;
    }

    // 5. Authenticated Blind user only: honor explicit saved opt-in across in-app views
    setSyncOnboardingState("idle");
    if (isCompletingLoginSuccessRef.current || loginFieldPhaseRef.current === "submitting_login") {
      clearLoginConfirmTimer();
      stopAudioPipeline("disabled");
      return;
    }
    let savedOptIn = false;
    try {
      savedOptIn = localStorage.getItem(VOICE_ENABLED_STORAGE_KEY) === "true";
    } catch {
      savedOptIn = false;
    }

    isDeactivatedForNonBlindRef.current = false;
    setVoiceGuidanceEnabled(savedOptIn);
    voiceGuidanceEnabledRef.current = savedOptIn;

    if (savedOptIn && !isManuallyPausedRef.current && document.visibilityState === "visible") {
      setIsVoiceGuideActive(true);
      isVoiceGuideActiveRef.current = true;
      void startVoiceListening(false, false);
    } else if (!savedOptIn && !isVoiceGuideActiveRef.current) {
      stopAudioPipeline("disabled");
    }
  }, [
    authLoading,
    cancelSpeech,
    clearAllLoginBuffers,
    clearAllRegistrationBuffers,
    clearLoginConfirmTimer,
    isAuthenticated,
    location.pathname,
    profile,
    setSyncOnboardingState,
    startVoiceListening,
    stopAudioPipeline,
    user,
  ]);

  // Sync registration & login field phase, spelling triggers, and auth results
  useEffect(() => {
    const onRequestSpelling = (e: Event) => {
      if (!isUserEligibleForBlindVoice()) return;
      const detail = (e as CustomEvent<{ field?: "name" | "email" | "login_email" }>).detail;
      if (detail?.field === "name") {
        pendingNameCandidateRef.current = null;
        spelledFirstNameBufferRef.current = "";
        spelledSurnameBufferRef.current = "";
        regFieldPhaseRef.current = "spelling_first_name";
        speak(
          "Please spell your first name by saying each letter separately. For example, say R, I, S, H, A, N. Say done when you finish. Then I will ask for your surname.",
          true,
        );
      } else if (detail?.field === "email") {
        pendingEmailCandidateRef.current = null;
        spelledEmailBufferRef.current = "";
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        regFieldPhaseRef.current = "spelling_email";
        speak(
          "Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.",
          true,
        );
      } else if (detail?.field === "login_email") {
        pendingLoginEmailRef.current = null;
        confirmedLoginEmailRef.current = null;
        spelledLoginEmailBufferRef.current = "";
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        loginFieldPhaseRef.current = "spelling_login_email";
        speak(
          "Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.",
          true,
        );
      }
    };

    const onSyncPhase = (e: Event) => {
      if (!isUserEligibleForBlindVoice()) return;
      const detail = (
        e as CustomEvent<{
          phase?: RegistrationFieldPhase;
          confirmedName?: string | null;
        }>
      ).detail;
      if (!detail?.phase) return;
      if (detail.confirmedName !== undefined) {
        confirmedNameRef.current = detail.confirmedName;
      }
      if (detail.phase === "listening_name" || detail.phase === "spelling_first_name") {
        pendingNameCandidateRef.current = null;
        spelledFirstNameBufferRef.current = "";
        spelledSurnameBufferRef.current = "";
      } else if (detail.phase === "listening_email" || detail.phase === "spelling_email") {
        pendingNameCandidateRef.current = null;
        pendingEmailCandidateRef.current = null;
        spelledEmailBufferRef.current = "";
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
      } else if (detail.phase === "listening_password") {
        pendingEmailCandidateRef.current = null;
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        passwordDraftBufferRef.current = "";
        confirmPasswordDraftBufferRef.current = "";
        pendingPasswordCandidateRef.current = null;
      } else if (detail.phase === "listening_confirm_password") {
        confirmPasswordDraftBufferRef.current = "";
      }
      regFieldPhaseRef.current = detail.phase;
    };

    const onSyncLoginPhase = (e: Event) => {
      if (!isUserEligibleForBlindVoice()) return;
      const detail = (
        e as CustomEvent<{
          phase?: LoginFieldPhase;
          confirmedEmail?: string | null;
        }>
      ).detail;
      if (!detail?.phase) return;
      if (detail.confirmedEmail !== undefined) {
        confirmedLoginEmailRef.current = detail.confirmedEmail;
      }
      if (detail.phase === "listening_login_email" || detail.phase === "spelling_login_email") {
        clearLoginConfirmTimer();
        loginConfirmRepromptCountRef.current = 0;
        pendingLoginEmailRef.current = null;
        confirmedLoginEmailRef.current = null;
        spelledLoginEmailBufferRef.current = "";
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        isSubmittingLoginRef.current = false;
      } else if (detail.phase === "listening_login_password") {
        clearLoginConfirmTimer();
        loginConfirmRepromptCountRef.current = 0;
        pendingLoginEmailRef.current = null;
        preservedEmailLocalRef.current = "";
        preservedEmailDomainRef.current = "";
        loginPasswordDraftRef.current = "";
        isSubmittingLoginRef.current = false;
      }
      loginFieldPhaseRef.current = detail.phase;
    };

    const onLoginAuthResult = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          success?: boolean;
          status?: number;
          errorMessage?: string;
        }>
      ).detail;
      clearLoginConfirmTimer();
      isSubmittingLoginRef.current = false;
      if (!detail || detail.success) {
        return;
      }

      loginPasswordDraftRef.current = "";
      window.dispatchEvent(new CustomEvent(LOGIN_PROTECTED_RESET_EVENT));

      if (!isVoiceGuideActiveRef.current) {
        return;
      }

      loginConfirmRepromptCountRef.current = 0;
      loginFieldPhaseRef.current = "listening_login_password";
      segmenterRef.current.reset();
      lastSttSubmissionRef.current = null;

      const resumePasswordListening = () => {
        if (
          pathnameRef.current === "/login" &&
          isVoiceGuideActiveRef.current &&
          !isAuthenticatedRef.current &&
          !isPausedRef.current &&
          loginFieldPhaseRef.current === "listening_login_password"
        ) {
          segmenterRef.current.reset();
          lastSttSubmissionRef.current = null;
          if (!isListeningRef.current || !hasLiveAudioTrack(micStreamRef.current)) {
            void startVoiceListeningRef.current(false, false);
          }
        }
      };

      const lowerErr = (detail.errorMessage || "").toLowerCase();
      if (detail.status === 429 || lowerErr.includes("too many")) {
        speak(
          "Too many sign in attempts right now. Your email is preserved and password cleared. Wait a moment, then dictate your password in short chunks or say change email.",
          true,
          resumePasswordListening,
        );
        return;
      }

      if (detail.status && detail.status >= 500) {
        speak(
          "Sign in service is temporarily unavailable. Your email is preserved and password cleared. Please dictate your password again in short chunks, or say change email.",
          true,
          resumePasswordListening,
        );
        return;
      }

      if (
        lowerErr.includes("network") ||
        lowerErr.includes("timed out") ||
        lowerErr.includes("fetch") ||
        lowerErr.includes("connect")
      ) {
        speak(
          "Could not reach the sign in server. Your email is preserved and password cleared. Check your connection, then dictate your password in short chunks or say change email.",
          true,
          resumePasswordListening,
        );
        return;
      }

      speak(
        "Sign in was unsuccessful. Please check your email and password. Your email is preserved and password cleared. Dictate your password in short chunks and say done or next, or say change email.",
        true,
        resumePasswordListening,
      );
    };

    window.addEventListener("voxonix:request-spelling", onRequestSpelling);
    window.addEventListener("voxonix:sync-reg-phase", onSyncPhase);
    window.addEventListener("voxonix:sync-login-phase", onSyncLoginPhase);
    window.addEventListener("voxonix:login-auth-result", onLoginAuthResult);
    return () => {
      window.removeEventListener("voxonix:request-spelling", onRequestSpelling);
      window.removeEventListener("voxonix:sync-reg-phase", onSyncPhase);
      window.removeEventListener("voxonix:sync-login-phase", onSyncLoginPhase);
      window.removeEventListener("voxonix:login-auth-result", onLoginAuthResult);
    };
  }, [clearLoginConfirmTimer, isUserEligibleForBlindVoice, speak]);

  // Unmount & pagehide resource cleanup
  useEffect(() => {
    const cleanup = () => {
      clearLoginConfirmTimer();
      cancelSpeech();
      stopAudioPipelineRef.current("disabled");
    };
    window.addEventListener("pagehide", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, [cancelSpeech, clearLoginConfirmTimer]);

  // Global keyboard shortcuts (Alt+B toggle guidance only when eligible, Escape stops speech immediately)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.altKey && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "v")) {
        if (!isUserEligibleForBlindVoice()) return;
        e.preventDefault();
        toggleVoiceGuide();
      } else if (e.key === "Escape" && isSpeakingRef.current) {
        cancelSpeech();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelSpeech, isUserEligibleForBlindVoice, toggleVoiceGuide]);

  return (
    <BlindVoiceAssistantContext.Provider
      value={{
        isVoiceGuideActive,
        isListening,
        isPaused,
        isSpeaking,
        voiceGuidanceEnabled,
        wakeStatus,
        onboardingState,
        isLockedOutForSession,
        blindActivationPending,
        clearBlindActivationPending,
        blindLoginPending,
        clearBlindLoginPending,
        startBlindVoiceLogin,
        completeBlindLoginSuccess,
        retryWakePermission,
        lockOutBlindForSession,
        selectBlindProfileAndStart,
        volumeLevel,
        isLoudEnough,
        lastSpokenText,
        lastTranscript,
        assistantError,
        ttsError,
        voicePreferences,
        voiceState,
        hasAudioStream,
        activeTrackCount,
        isSpeechSupported,
        micPermission,
        gnaniAvailable,
        pendingConfirmation,
        enableVoiceGuidance,
        disableVoiceGuidance,
        pauseListening,
        resumeListening,
        activateVoiceGuide,
        deactivateVoiceGuide,
        toggleVoiceGuide,
        speak,
        repeatLastSpoken,
        cancelSpeech,
        confirmPendingAction,
        cancelPendingAction,
        updateVoicePreferences,
        startVoiceListening,
        stopVoiceListening,
      }}
    >
      {children}
    </BlindVoiceAssistantContext.Provider>
  );
}

function hasLiveAudioTrack(stream: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);
}
