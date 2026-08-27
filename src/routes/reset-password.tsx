import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { supabase } from "@/lib/supabase/client";
import { ArrowUpRight, Loader2, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => search,
  head: () => ({
    meta: [
      { title: "Reset Password — VOXONIX" },
      { name: "description", content: "Set a new password for your Voxonix account." },
    ],
  }),
  component: ResetPasswordPage,
});

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isRecoveryActive, setIsRecoveryActive] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const isExchangingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function initRecovery() {
      if (typeof window === "undefined") return;

      // Prevent concurrent duplicate executions in React StrictMode
      if (isExchangingRef.current) return;
      isExchangingRef.current = true;

      const url = new URL(window.location.href);

      // Check for error parameters in query string (e.g. expired link from Supabase)
      const errorDesc = url.searchParams.get("error_description");
      const errorParam = url.searchParams.get("error");
      if (errorDesc || errorParam) {
        if (!mounted) return;
        setServerError(
          errorDesc
            ? decodeURIComponent(errorDesc.replace(/\+/g, " "))
            : "The password recovery link is invalid or has expired.",
        );
        setIsRecoveryActive(false);
        return;
      }

      // Check if session is ALREADY active (e.g. from previous exchange or listener)
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        if (!mounted) return;
        setIsRecoveryActive(true);
        // Clean URL params cleanly
        if (url.search) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return;
      }

      // Check for PKCE code in query string (?code=...)
      const code = url.searchParams.get("code");
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!mounted) return;
          if (!error && data?.session) {
            setIsRecoveryActive(true);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
          if (error) {
            console.warn("exchangeCodeForSession error:", error);
            // Double check if session was established anyway
            const { data: retrySession } = await supabase.auth.getSession();
            if (retrySession.session) {
              setIsRecoveryActive(true);
              window.history.replaceState({}, document.title, window.location.pathname);
              return;
            }
            setServerError(error.message);
            setIsRecoveryActive(false);
            return;
          }
        } catch (err) {
          console.warn("Failed to exchange recovery code for session:", err);
        }
      }

      // Check for token_hash or token in query string (?token_hash=... or ?token=...)
      const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token");
      if (tokenHash) {
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (!mounted) return;
          if (!error && data?.session) {
            setIsRecoveryActive(true);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
          if (error) {
            setServerError(error.message);
            setIsRecoveryActive(false);
            return;
          }
        } catch (err) {
          console.warn("Failed to verify OTP token for session:", err);
        }
      }

      // Check hash fragment for implicit recovery flow (#access_token=...&type=recovery)
      const hash = window.location.hash;
      if (hash.includes("type=recovery") || hash.includes("access_token=")) {
        // Supabase client auth listener processes hash fragments asynchronously
        return;
      }

      // If no session, no code, no token_hash, and no hash fragment, wait for timeout fallback
      const timer = setTimeout(async () => {
        if (!mounted) return;
        const { data: finalCheck } = await supabase.auth.getSession();
        if (finalCheck.session) {
          setIsRecoveryActive(true);
        } else {
          setIsRecoveryActive(false);
        }
      }, 1500);

      return () => clearTimeout(timer);
    }

    initRecovery();

    // Listen for PASSWORD_RECOVERY or SIGNED_IN event from Supabase
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setIsRecoveryActive(true);
      } else if (event === "SIGNED_OUT") {
        setIsRecoveryActive(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    setServerError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("same password") || msg.includes("different from the old password")) {
          setServerError("New password must be different from your old password.");
        } else if (msg.includes("expired") || msg.includes("token")) {
          setServerError(
            "Your recovery link has expired. Please request a new password reset link.",
          );
        } else {
          setServerError(error.message);
        }
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  // Loading state
  if (isRecoveryActive === null) {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <WordMark />
        </header>
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center items-center px-6 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-crimson" />
          <p className="mt-4 text-sm text-noir/60 font-medium">Verifying reset authorization…</p>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <WordMark />
        </header>
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 text-center shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 font-display text-3xl text-noir">Password updated.</h1>
            <p className="mt-2 text-sm leading-relaxed text-noir/65">
              Your password has been successfully reset. You can now access your account.
            </p>
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="mt-8 w-full rounded-full bg-crimson py-3 text-sm font-medium text-cream transition hover:bg-wine shadow-md"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Invalid / Expired token state
  if (!isRecoveryActive) {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <WordMark />
        </header>
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 text-center shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-crimson/10 text-crimson">
              <KeyRound className="h-7 w-7" />
            </div>
            <h1 className="mt-4 font-display text-3xl text-noir">Invalid or expired link.</h1>
            <p className="mt-2 text-sm leading-relaxed text-noir/65">
              {serverError ||
                "This password reset link is invalid or has already expired. For security, recovery links can only be used once."}
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                to="/login"
                className="w-full rounded-full bg-crimson py-3 text-sm font-medium text-cream transition hover:bg-wine shadow-md text-center"
              >
                Request a new link
              </Link>
              <Link
                to="/"
                className="text-center text-sm text-noir/55 underline-offset-4 hover:text-noir hover:underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active form view
  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <WordMark />
        <Link
          to="/login"
          className="group inline-flex items-center gap-1.5 rounded-full bg-noir px-4 py-2 text-sm font-medium text-cream transition hover:bg-wine"
        >
          Sign in
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
        <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
          <span className="font-display text-xs italic text-crimson">Nº 01 · Security</span>
          <h1 className="mt-2 font-display text-4xl text-noir">Set new password.</h1>
          <p className="mt-2 text-sm text-noir/65">
            Enter your new password below to regain access to your account.
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

          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field
              label="New Password"
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              error={errors.password?.message}
              {...register("password")}
            />
            <Field
              label="Confirm New Password"
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating password…
                </>
              ) : (
                "Update password"
              )}
            </button>
          </form>
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
    <label
      htmlFor={id}
      className="mb-1.5 block text-[11px] uppercase tracking-[0.22em] text-noir/55"
    >
      {label}
    </label>
    <input
      id={id}
      {...props}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`w-full rounded-xl border bg-background/60 px-4 py-3 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
        error ? "border-crimson/60 focus:border-crimson" : "border-noir/15 focus:border-crimson"
      }`}
    />
    {error && (
      <p id={`${id}-error`} className="mt-1 text-xs text-crimson" role="alert">
        {error}
      </p>
    )}
  </div>
);
