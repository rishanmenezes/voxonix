import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { useAuth } from "@/hooks/use-auth";
import { redirectIfAuthenticated } from "@/lib/auth-helpers";
import { ArrowUpRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

// ── Search param schema ───────────────────────────────────────────────────────
// Validates the optional ?redirect= query parameter so TanStack Router types it.

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  // If the user is already authenticated, send them straight to the dashboard.
  beforeLoad: redirectIfAuthenticated,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — VOXONIX" },
      { name: "description", content: "Sign in to your Voxonix account." },
    ],
  }),
  component: LoginPage,
});

// ── Validation schemas ────────────────────────────────────────────────────────

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const resetSchema = z.object({
  resetEmail: z.string().email("Enter a valid email address"),
});

type SignInValues = z.infer<typeof signInSchema>;
type ResetValues = z.infer<typeof resetSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

type View = "signin" | "forgot" | "reset-sent";

function LoginPage() {
  const { signIn, resetPassword, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  // Read the optional ?redirect= search param — typed and validated above.
  const { redirect: redirectTo } = useSearch({ from: "/login" });

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: redirectTo || "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate, redirectTo]);

  const [view, setView] = useState<View>("signin");
  const [serverError, setServerError] = useState<string | null>(null);

  // ── Sign-in form ────────────────────────────────────────────────────────────
  const {
    register: regSignIn,
    handleSubmit: handleSignIn,
    formState: { errors: signInErrors, isSubmitting: isSigningIn },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: "onBlur",
  });

  // ── Forgot-password form ────────────────────────────────────────────────────
  const {
    register: regReset,
    handleSubmit: handleReset,
    formState: { errors: resetErrors, isSubmitting: isResetting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const onSignIn = async (values: SignInValues) => {
    setServerError(null);
    const { error } = await signIn(values.email, values.password);

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        setServerError("Incorrect email or password. Check your credentials and try again.");
      } else if (msg.includes("email not confirmed")) {
        setServerError(
          "Your email address has not been confirmed. Check your inbox for the verification link.",
        );
      } else if (msg.includes("too many requests")) {
        setServerError("Too many sign-in attempts. Please wait a moment before trying again.");
      } else {
        setServerError(error.message);
      }
      return;
    }

    // ── THE FIX ──────────────────────────────────────────────────────────────
    // After successful sign-in, go to:
    //   1. The ?redirect= path if it was set (e.g. came from /room/ABC123 → login)
    //   2. /dashboard otherwise
    if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
      navigate({ to: redirectTo as "/" });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const onResetPassword = async (values: ResetValues) => {
    setServerError(null);
    const { error } = await resetPassword(values.resetEmail);

    if (error) {
      setServerError(error.message);
      return;
    }

    setView("reset-sent");
  };

  // ── Reset-sent confirmation ───────────────────────────────────────────────────
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

  // ── Forgot-password form ──────────────────────────────────────────────────────
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
            Get started
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <span className="font-display text-xs italic text-crimson">Nº 01 · Reset password</span>
            <h1 className="mt-2 font-display text-4xl text-noir">Forgot your password?</h1>
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
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
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
                className="font-medium text-crimson underline-offset-4 hover:underline focus-visible:underline"
              >
                Back to sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Sign-in form (default view) ───────────────────────────────────────────────
  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <WordMark />
        <Link
          to="/register"
          className="group inline-flex items-center gap-1.5 rounded-full bg-noir px-4 py-2 text-sm font-medium text-cream transition hover:bg-wine"
        >
          Get started
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
        <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
          <span className="font-display text-xs italic text-crimson">Nº 01 · Sign in</span>
          <h1 className="mt-2 font-display text-4xl text-noir">Welcome back.</h1>
          <p className="mt-2 text-sm text-noir/65">
            {redirectTo
              ? "Sign in to continue to your destination."
              : "Sign in to continue to your rooms."}
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

          <form className="mt-6 space-y-4" onSubmit={handleSignIn(onSignIn)} noValidate>
            <Field
              label="Email"
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={signInErrors.email?.message}
              {...regSignIn("email")}
            />
            <Field
              label="Password"
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={signInErrors.password?.message}
              {...regSignIn("password")}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setView("forgot");
                  setServerError(null);
                }}
                className="text-xs text-noir/50 underline-offset-4 hover:text-crimson hover:underline focus-visible:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-noir/60">
            New here?{" "}
            <Link
              to="/register"
              className="font-medium text-crimson underline-offset-4 hover:underline focus-visible:underline"
            >
              Create an account
            </Link>
          </p>
        </div>

        <nav className="mt-10 flex items-center justify-center gap-6 text-xs text-noir/45">
          <Link to="/" className="transition hover:text-noir">
            Home
          </Link>
          <span className="h-3 w-px bg-noir/20" />
          <Link to="/register" className="transition hover:text-noir">
            Create account
          </Link>
        </nav>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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
      <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-crimson">
        {error}
      </p>
    )}
  </div>
);
