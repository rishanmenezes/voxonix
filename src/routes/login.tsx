import { useState, useEffect, useCallback, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { useAuth } from "@/hooks/use-auth";
import { useBlindVoiceAssistant } from "@/hooks/use-blind-voice-assistant";
import { redirectIfAuthenticated } from "@/lib/auth-helpers";
import {
  ArrowUpRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Volume2,
  ShieldCheck,
} from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  beforeLoad: redirectIfAuthenticated,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign In — VOXONIX" },
      { name: "description", content: "Sign in to your Voxonix account." },
    ],
  }),
  component: LoginPage,
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const resetSchema = z.object({
  resetEmail: z.string().email("Enter a valid email address"),
});

type SignInValues = z.infer<typeof signInSchema>;
type ResetValues = z.infer<typeof resetSchema>;
type View = "signin" | "forgot" | "reset-sent";

function LoginPage() {
  const { signIn, resetPassword, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const { redirect: redirectTo } = useSearch({ from: "/login" });

  const [view, setView] = useState<View>("signin");
  const [serverError, setServerError] = useState<string | null>(null);
  const [candidateEmail, setCandidateEmail] = useState<string | null>(null);
  const [voiceStep, setVoiceStep] = useState<1 | 2 | 3>(1);
  const [voicePasswordCount, setVoicePasswordCount] = useState<number>(0);
  const {
    isVoiceGuideActive,
    toggleVoiceGuide,
    speak: assistantSpeak,
    blindLoginPending,
    clearBlindLoginPending,
    startBlindVoiceLogin,
    completeBlindLoginSuccess,
  } = useBlindVoiceAssistant();
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>("");
  const isDelayingRedirectForSpeechRef = useRef(false);
  const isSubmitInFlightRef = useRef(false);

  useEffect(() => {
    if (!loading && isAuthenticated && !isDelayingRedirectForSpeechRef.current) {
      navigate({ to: redirectTo || "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate, redirectTo]);

  const announceAndSpeak = useCallback(
    (text: string) => {
      setAriaAnnouncement(text);
      if (isVoiceGuideActive) {
        assistantSpeak(text, true);
      }
    },
    [assistantSpeak, isVoiceGuideActive],
  );

  const {
    control,
    handleSubmit: handleSignIn,
    setValue: setSignInValue,
    getValues: getSignInValues,
    formState: { errors: signInErrors, isSubmitting: isSigningIn },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const {
    register: regReset,
    handleSubmit: handleReset,
    formState: { errors: resetErrors, isSubmitting: isResetting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
  });

  const onSignIn = useCallback(
    async (values: SignInValues) => {
      if (isSubmitInFlightRef.current || isDelayingRedirectForSpeechRef.current) {
        return;
      }
      isSubmitInFlightRef.current = true;
      setServerError(null);

      const shouldCoordinateBlindSuccess = isVoiceGuideActive;
      if (shouldCoordinateBlindSuccess) {
        isDelayingRedirectForSpeechRef.current = true;
      }

      try {
        const { error } = await signIn(values.email, values.password);

        if (error) {
          isDelayingRedirectForSpeechRef.current = false;
          setServerError(error.message);
          setSignInValue("password", "");
          setVoicePasswordCount(0);
          const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
          if (pwEl) pwEl.value = "";
          setVoiceStep(2);
          setAriaAnnouncement(`Sign in failed: ${error.message}`);
          document.getElementById("login-password")?.focus();
          window.dispatchEvent(
            new CustomEvent("voxonix:login-auth-result", {
              detail: {
                success: false,
                status: error.status,
                errorMessage: error.message,
              },
            }),
          );
          return;
        }

        setSignInValue("password", "");
        setVoicePasswordCount(0);
        const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
        if (pwEl) pwEl.value = "";

        window.dispatchEvent(
          new CustomEvent("voxonix:login-auth-result", {
            detail: { success: true },
          }),
        );

        if (shouldCoordinateBlindSuccess) {
          setAriaAnnouncement(
            "Sign in successful. Welcome to VOXONIX. Your dashboard is opening now.",
          );
          await completeBlindLoginSuccess();
        }

        isDelayingRedirectForSpeechRef.current = false;

        if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
          navigate({ to: redirectTo as "/", replace: true });
        } else {
          navigate({ to: "/dashboard", replace: true });
        }
      } finally {
        isSubmitInFlightRef.current = false;
      }
    },
    [completeBlindLoginSuccess, isVoiceGuideActive, navigate, redirectTo, setSignInValue, signIn],
  );

  const onResetPassword = async (values: ResetValues) => {
    setServerError(null);
    const { error } = await resetPassword(values.resetEmail);

    if (error) {
      setServerError(error.message);
      return;
    }

    setView("reset-sent");
  };

  // Start Blind voice login automatically when arriving from landing "Blind" -> "sign in"
  useEffect(() => {
    if (blindLoginPending) {
      clearBlindLoginPending();
      setVoiceStep(1);
      setAriaAnnouncement(
        "Blind voice login activated. Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider.",
      );
      void startBlindVoiceLogin();
      setTimeout(() => {
        document.getElementById("login-email")?.focus();
      }, 100);
    }
  }, [blindLoginPending, clearBlindLoginPending, startBlindVoiceLogin]);

  // Keep masked password field cleared when reset or leaving page
  useEffect(() => {
    const clearPasswordUi = () => {
      setSignInValue("password", "");
      setVoicePasswordCount(0);
      const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
      if (pwEl) pwEl.value = "";
    };

    window.addEventListener("voxonix:login-clear-password", clearPasswordUi);
    return () => {
      window.removeEventListener("voxonix:login-clear-password", clearPasswordUi);
      clearPasswordUi();
    };
  }, [setSignInValue]);

  // Voice assistant conversational listener: feeds login email, password, and submit commands
  useEffect(() => {
    interface LoginVoiceDetail {
      intent?: string;
      candidateEmail?: string;
      extractedEmail?: string;
      extractedPassword?: string;
    }

    const handleVoiceInput = (event: Event) => {
      const customEvent = event as CustomEvent<LoginVoiceDetail>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.intent === "start_again") {
        setServerError(null);
        setCandidateEmail(null);
        setSignInValue("email", "");
        setSignInValue("password", "");
        setVoicePasswordCount(0);
        setVoiceStep(1);
        const emailEl = document.getElementById("login-email") as HTMLInputElement | null;
        if (emailEl) emailEl.value = "";
        const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
        if (pwEl) pwEl.value = "";
        document.getElementById("login-email")?.focus();
        setAriaAnnouncement(
          "All login fields cleared. Please spell the part before the at sign by saying each letter separately.",
        );
        return;
      }

      if (detail.intent === "enter_email") {
        setVoiceStep(1);
        document.getElementById("login-email")?.focus();
        return;
      }

      if (detail.intent === "reset_email") {
        setCandidateEmail(null);
        setSignInValue("email", "");
        setVoiceStep(1);
        const el = document.getElementById("login-email") as HTMLInputElement | null;
        if (el) el.value = "";
        document.getElementById("login-email")?.focus();
        return;
      }

      if (detail.intent === "spelling_email_progress") {
        const partial = detail.extractedEmail || "";
        setCandidateEmail(null);
        setVoiceStep(1);
        setSignInValue("email", partial, { shouldDirty: true, shouldTouch: true });
        const el = document.getElementById("login-email") as HTMLInputElement | null;
        if (el) el.value = partial;
        return;
      }

      if (detail.intent === "candidate_email") {
        const email = detail.candidateEmail || detail.extractedEmail;
        if (email) {
          setCandidateEmail(email);
          setVoiceStep(1);
          setSignInValue("email", email, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          const el = document.getElementById("login-email") as HTMLInputElement | null;
          if (el) el.value = email;
          setAriaAnnouncement(
            `Candidate email: ${email}. Say confirm, change username, change domain, or change.`,
          );
          return;
        }
      }

      if (detail.intent === "fill_email" || (detail.extractedEmail && !detail.intent)) {
        const email = detail.extractedEmail;
        if (email) {
          setCandidateEmail(null);
          setVoiceStep(2);
          setSignInValue("email", email, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
          const el = document.getElementById("login-email") as HTMLInputElement | null;
          if (el) el.value = email;
          setAriaAnnouncement(
            `Email confirmed: ${email}. Now dictate your password in short chunks and say next or done when finished.`,
          );
          setTimeout(() => {
            document.getElementById("login-password")?.focus();
          }, 100);
          return;
        }
      }

      if (detail.intent === "fill_voice_password" && typeof detail.extractedPassword === "string") {
        const len = detail.extractedPassword.length;
        setSignInValue("password", detail.extractedPassword, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setVoicePasswordCount(len);
        setVoiceStep(2);
        document.getElementById("login-password")?.focus();
        setAriaAnnouncement(`Password updated: ${len} characters captured in masked field.`);
        return;
      }

      if (
        detail.intent === "login_password_ready" &&
        typeof detail.extractedPassword === "string"
      ) {
        const len = detail.extractedPassword.length;
        setSignInValue("password", detail.extractedPassword, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setVoicePasswordCount(len);
        setVoiceStep(3);
        const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
        pwEl?.blur();
        setTimeout(() => {
          document.getElementById("btn-login-submit")?.focus();
        }, 60);
        setAriaAnnouncement(
          `Password captured (${len} characters). Say sign in to continue, add more to append, or change password.`,
        );
        return;
      }

      if (detail.intent === "reset_passwords") {
        setSignInValue("password", "");
        setVoicePasswordCount(0);
        setVoiceStep(2);
        const pwEl = document.getElementById("login-password") as HTMLInputElement | null;
        if (pwEl) pwEl.value = "";
        document.getElementById("login-password")?.focus();
        setAriaAnnouncement(
          "Password cleared. Dictate your password in short chunks and say next or done when finished.",
        );
        return;
      }

      if (detail.intent === "repeat") {
        const stepPrompt =
          voiceStep === 1
            ? "Step 1 of 3: Please spell the part before the at sign by saying each letter separately. Speak the numbers individually. Then say at sign and your email provider."
            : voiceStep === 2
              ? "Step 2 of 3: Dictate your password in short chunks using capital or small letters, numbers, and symbol names like exclamation mark or underscore. Say next or done when finished."
              : "Step 3 of 3: Your email is confirmed and password is captured. Say sign in to continue, add more to append characters, or say change password.";
        announceAndSpeak(stepPrompt);
        return;
      }

      if (detail.intent === "submit" || detail.intent === "submit_login") {
        const currentVals = getSignInValues();
        if (currentVals.email?.trim() && currentVals.password && currentVals.password.length > 0) {
          void onSignIn(currentVals);
        }
      }
    };

    window.addEventListener("voxonix:voice-input", handleVoiceInput);
    return () => window.removeEventListener("voxonix:voice-input", handleVoiceInput);
  }, [announceAndSpeak, getSignInValues, onSignIn, setSignInValue, voiceStep]);

  if (view === "reset-sent") {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <WordMark />
        </header>
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 text-center shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 font-display text-3xl text-noir">Check your inbox.</h1>
            <p className="mt-2 text-sm leading-relaxed text-noir/65">
              If that address is registered, we sent a password-reset link. Follow it to choose a
              new password, then come back to sign in.
            </p>
            <button
              onClick={() => {
                setView("signin");
                setServerError(null);
              }}
              className="mt-8 w-full rounded-full bg-crimson py-3 text-sm font-medium text-cream transition hover:bg-wine"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "forgot") {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <WordMark />
          <Link
            to="/register"
            className="group inline-flex items-center gap-1.5 rounded-full bg-noir px-4 py-2 text-sm font-medium text-cream transition hover:bg-wine"
          >
            Create Account
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <span className="font-display text-xs italic text-crimson">Reset Password</span>
            <h1 className="mt-2 font-display text-4xl text-noir">Forgot password?</h1>
            <p className="mt-2 text-sm text-noir/65">
              Enter your email and we will send a reset link if an account exists.
            </p>

            {serverError && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-crimson/30 bg-crimson/8 px-4 py-3 text-sm text-crimson"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleReset(onResetPassword)} noValidate>
              <Field
                label="Email"
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={resetErrors.resetEmail?.message}
                {...regReset("resetEmail")}
              />
              <button
                type="submit"
                disabled={isResetting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-noir/60">
              Remembered it?{" "}
              <button
                type="button"
                onClick={() => {
                  setView("signin");
                  setServerError(null);
                }}
                className="font-medium text-crimson underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      <div role="status" aria-live="assertive" className="sr-only">
        {ariaAnnouncement}
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <WordMark />
        <Link
          to="/register"
          className="group inline-flex items-center gap-1.5 rounded-full bg-crimson px-5 py-2 text-sm font-medium text-cream transition hover:bg-wine"
        >
          Create Account
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
        <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs italic text-crimson">Sign In</span>
            <button
              type="button"
              id="btn-login-voice-guidance"
              onClick={toggleVoiceGuide}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson ${
                isVoiceGuideActive
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-background text-noir/75 border-noir/20 hover:border-wine hover:text-wine"
              }`}
              aria-pressed={isVoiceGuideActive}
              aria-label={
                isVoiceGuideActive
                  ? "Turn Voice Guidance Off (Alt+B)"
                  : "Enable Voice Guidance (Alt+B)"
              }
            >
              <Volume2 className="h-3.5 w-3.5 text-amber-700" />
              <span>{isVoiceGuideActive ? "Voice ON" : "Voice Guidance (Alt+B)"}</span>
            </button>
          </div>

          <h1 className="mt-2 font-display text-3xl font-bold text-noir">Welcome to VOXONIX</h1>
          <p className="mt-1.5 text-sm text-noir/65">
            {redirectTo
              ? "Sign in to access your designated room."
              : "Sign in to access your assistive communication dashboard."}
          </p>

          {/* Server error */}
          {serverError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-crimson/30 bg-crimson/8 px-4 py-3 text-sm text-crimson"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {isVoiceGuideActive && (
            <div
              role="status"
              data-voice-login-step={voiceStep}
              className="mt-4 rounded-xl border border-amber-300 bg-amber-50/85 p-3.5 text-xs text-amber-950 space-y-1.5"
            >
              <div className="flex items-center justify-between font-semibold text-wine">
                <span>Blind Voice Login Active</span>
                <span>Step {voiceStep} of 3</span>
              </div>
              <p>
                {voiceStep === 1 &&
                  'Spell the part before the at sign by saying each letter separately and numbers individually, then say "at sign" and your email provider.'}
                {voiceStep === 2 &&
                  'Dictate your password in short chunks (e.g., "capital R, small i, number 5, at sign, hash"), then say "next" or "done".'}
                {voiceStep === 3 &&
                  'Say "sign in" to authenticate, "add more" to append more password characters, or "change password".'}
              </p>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSignIn(onSignIn)} noValidate>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-xs font-semibold text-noir"
                  >
                    Email Address
                  </label>
                  <input
                    {...field}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={!!signInErrors.email}
                    aria-describedby={signInErrors.email ? "login-email-error" : undefined}
                    className={`w-full rounded-xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                      signInErrors.email
                        ? "border-crimson/60 focus:border-crimson"
                        : "border-noir/20 focus:border-crimson"
                    }`}
                  />
                  {signInErrors.email && (
                    <p id="login-email-error" role="alert" className="mt-1 text-xs text-crimson">
                      {signInErrors.email.message}
                    </p>
                  )}
                </div>
              )}
            />

            {candidateEmail && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2">
                <p className="font-semibold">
                  Recognized email: <span className="font-bold text-wine">{candidateEmail}</span>.
                  Say &quot;Confirm&quot;, &quot;Change username&quot;, &quot;Change domain&quot;,
                  or &quot;Change&quot;.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = candidateEmail;
                      setCandidateEmail(null);
                      setSignInValue("email", confirmed, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                      setSignInValue("password", "");
                      setVoicePasswordCount(0);
                      setVoiceStep(2);
                      window.dispatchEvent(
                        new CustomEvent("voxonix:sync-login-phase", {
                          detail: {
                            phase: "listening_login_password",
                            confirmedEmail: confirmed,
                          },
                        }),
                      );
                      document.getElementById("login-password")?.focus();
                      announceAndSpeak(
                        `Email confirmed as ${confirmed}. Now dictate your existing password in short chunks using capital or small letters, numbers, and symbol names. Say next or done when finished. Your password stays masked and is never spoken aloud.`,
                      );
                    }}
                    className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    ✓ Confirm Email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateEmail(null);
                      setSignInValue("email", "");
                      setVoiceStep(1);
                      document.getElementById("login-email")?.focus();
                      window.dispatchEvent(
                        new CustomEvent("voxonix:request-spelling", {
                          detail: { field: "login_email" },
                        }),
                      );
                    }}
                    className="rounded-full bg-amber-200/80 px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-300/80"
                  >
                    Spell Email Again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateEmail(null);
                      setSignInValue("email", "");
                      setVoiceStep(1);
                      window.dispatchEvent(
                        new CustomEvent("voxonix:sync-login-phase", {
                          detail: { phase: "spelling_login_email", confirmedEmail: null },
                        }),
                      );
                      document.getElementById("login-email")?.focus();
                      announceAndSpeak(
                        "Cleared email. Please spell the part before the at sign by saying each letter separately.",
                      );
                    }}
                    className="rounded-full bg-noir/10 px-3 py-1 text-xs font-semibold text-noir hover:bg-noir/20"
                  >
                    ✗ Change Email
                  </button>
                </div>
              </div>
            )}

            {isVoiceGuideActive && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-2.5 text-xs text-amber-950">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-700 shrink-0" />
                <div className="space-y-0.5">
                  <p>
                    Blind Voice Password: Dictate in short chunks via Gnani Prisma (e.g.,
                    &quot;capital R, small i, number 5, at sign, hash&quot;), then say
                    &quot;next&quot; or &quot;done&quot;. Characters stay masked and are never
                    spoken aloud or cached.
                  </p>
                  {voicePasswordCount > 0 && (
                    <p className="font-semibold text-wine">
                      Masked password length: {voicePasswordCount} characters captured.
                    </p>
                  )}
                </div>
              </div>
            )}

            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-1.5 block text-xs font-semibold text-noir"
                  >
                    Password
                  </label>
                  <input
                    {...field}
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!signInErrors.password}
                    aria-describedby={signInErrors.password ? "login-password-error" : undefined}
                    className={`w-full rounded-xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
                      signInErrors.password
                        ? "border-crimson/60 focus:border-crimson"
                        : "border-noir/20 focus:border-crimson"
                    }`}
                  />
                  {signInErrors.password && (
                    <p id="login-password-error" role="alert" className="mt-1 text-xs text-crimson">
                      {signInErrors.password.message}
                    </p>
                  )}
                </div>
              )}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setView("forgot");
                  setServerError(null);
                }}
                className="text-xs text-noir/50 underline-offset-4 hover:text-crimson hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={isSigningIn}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-semibold text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-noir/60">
            Need an account?{" "}
            <Link
              to="/register"
              className="font-semibold text-crimson underline-offset-4 hover:underline"
            >
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function WordMark() {
  return (
    <Link to="/" className="flex items-baseline gap-2">
      <span className="font-display text-[22px] italic text-wine">Voxonix</span>
      <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">✕ AI</span>
    </Link>
  );
}

const Field = ({
  label,
  id,
  error,
  ...props
}: {
  label: string;
  id: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-noir">
      {label}
    </label>
    <input
      id={id}
      {...props}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`w-full rounded-xl border bg-background px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
        error ? "border-crimson/60 focus:border-crimson" : "border-noir/20 focus:border-crimson"
      }`}
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-crimson">
        {error}
      </p>
    )}
  </div>
);
