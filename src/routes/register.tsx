import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { useAuth } from "@/context/auth-context";
import { useAccessibility } from "@/context/accessibility-context";
import { redirectIfAuthenticated } from "@/lib/auth-helpers";
import {
  ALL_PROFILES_LIST,
  DEFAULT_PREFERENCES_BY_PROFILE,
  type AccessibilityProfile,
} from "@/lib/accessibility";
import { ArrowUpRight, CheckCircle2, Loader2, AlertCircle, Eye, Ear, MessageSquare, User, Check } from "lucide-react";

export const Route = createFileRoute("/register")({
  beforeLoad: redirectIfAuthenticated,
  head: () => ({
    meta: [
      { title: "Create account — VOXONIX" },
      { name: "description", content: "Create your Voxonix account and choose your communication mode." },
    ],
  }),
  component: RegisterPage,
});

// ── Validation schema ─────────────────────────────────────────────────────────

const schema = z
  .object({
    displayName: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(64, "Name must be 64 characters or fewer"),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
    accessibilityProfile: z.enum(["blind", "deaf", "non-speaking", "standard"], {
      required_error: "Please select how you want to communicate",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

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

// ── Component ─────────────────────────────────────────────────────────────────

function RegisterPage() {
  const { signUp, isAuthenticated, loading } = useAuth();
  const { setProfile } = useAccessibility();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      accessibilityProfile: "standard",
    },
  });

  const selectedProfile = watch("accessibilityProfile") as AccessibilityProfile;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);

    const defaultPrefs = DEFAULT_PREFERENCES_BY_PROFILE[values.accessibilityProfile];

    const { error } = await signUp({
      email: values.email,
      password: values.password,
      displayName: values.displayName,
      accessibilityProfile: values.accessibilityProfile,
      communicationPreferences: defaultPrefs,
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        setServerError("An account with this email already exists. Try signing in instead.");
      } else if (error.message.toLowerCase().includes("invalid email")) {
        setServerError("That email address does not look valid.");
      } else if (error.message.toLowerCase().includes("password")) {
        setServerError("Password did not meet Supabase requirements. Use at least 8 characters.");
      } else {
        setServerError(error.message);
      }
      return;
    }

    // Persist the chosen profile locally via the accessibility context.
    await setProfile(values.accessibilityProfile, defaultPrefs);
    setEmailSent(true);
  };

  // ── Email-sent confirmation screen ───────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-[22px] italic text-wine">Voxonix</span>
            <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">
              ✕ AI
            </span>
          </Link>
        </header>
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 text-center shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 font-display text-3xl text-noir">Check your inbox.</h1>
            <p className="mt-2 text-sm leading-relaxed text-noir/65">
              We sent a confirmation link to your email. Click it to activate your account, then
              come back and sign in.
            </p>
            <p className="mt-4 text-xs text-noir/40">
              No email? Check your spam folder or try registering again with the same address.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => navigate({ to: "/login" })}
                className="w-full rounded-full bg-crimson py-3 text-sm font-medium text-cream transition hover:bg-wine"
              >
                Go to sign in
              </button>
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

  // ── Registration form ─────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-[22px] italic text-wine">Voxonix</span>
          <span className="font-display text-[22px] font-medium tracking-[0.04em] text-noir">
            ✕ AI
          </span>
        </Link>
        <Link
          to="/login"
          className="group inline-flex items-center gap-1.5 rounded-full border border-noir/25 px-4 py-2 text-sm font-medium text-noir transition hover:border-noir hover:bg-noir hover:text-cream"
        >
          Sign in
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      {/* Form card */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center px-6 py-12">
        <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-6 sm:p-8 shadow-[0_30px_80px_-40px_rgba(32,14,1,0.35)]">
          <span className="font-display text-xs italic text-crimson">Nº 02 · Create account</span>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl text-noir">Join Voxonix.</h1>
          <p className="mt-2 text-sm text-noir/65">
            Configure how you communicate. You can customize or change these preferences anytime.
          </p>

          {/* Server error banner */}
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
            {/* Display name */}
            <Field
              label="Display name"
              id="reg-name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              error={errors.displayName?.message}
              {...register("displayName")}
            />

            {/* Email */}
            <Field
              label="Email"
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register("email")}
            />

            {/* Password Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Password"
                id="reg-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 chars, 1 capital, 1 number"
                error={errors.password?.message}
                {...register("password")}
              />

              <Field
                label="Confirm password"
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
            </div>

            {/* Communication Mode Selection Cards */}
            <div className="pt-2">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-noir/55">
                How would you like to communicate?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALL_PROFILES_LIST.map((p) => {
                  const isSelected = selectedProfile === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setValue("accessibilityProfile", p.id, { shouldValidate: true })}
                      className={`relative flex flex-col p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-crimson bg-crimson/5 ring-1 ring-crimson shadow-sm"
                          : "border-noir/15 bg-background/50 hover:border-noir/30 hover:bg-background/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-noir/5 text-noir">
                            <ProfileIcon icon={p.icon} />
                          </span>
                          <div>
                            <span className="text-sm font-semibold text-noir">{p.label}</span>
                            <span className="ml-1.5 text-[10px] uppercase font-bold text-crimson/80">
                              {p.modeDescription}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="h-4 w-4 rounded-full bg-crimson text-cream flex items-center justify-center">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-noir/65 leading-relaxed">{p.description}</p>
                    </button>
                  );
                })}
              </div>
              {errors.accessibilityProfile && (
                <p className="mt-1 text-xs text-crimson">{errors.accessibilityProfile.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream shadow-md transition hover:bg-wine disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-noir/60">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-crimson underline-offset-4 hover:underline focus-visible:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        <nav className="mt-8 flex items-center justify-center gap-6 text-xs text-noir/45">
          <Link to="/" className="transition hover:text-noir">
            Home
          </Link>
          <span className="h-3 w-px bg-noir/20" />
          <Link to="/login" className="transition hover:text-noir">
            Sign in
          </Link>
        </nav>
      </div>
    </div>
  );
}

// ── Field component ───────────────────────────────────────────────────────────

const Field = ({
  label,
  id,
  error,
  ...props
}: { label: string; id: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
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
      className={`w-full rounded-xl border bg-background/60 px-4 py-2.5 text-sm text-noir placeholder:text-noir/35 focus:outline-none focus:ring-2 focus:ring-crimson/25 ${
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
