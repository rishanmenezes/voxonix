import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { ArrowUpRight, Loader2, CheckCircle2, KeyRound } from "lucide-react";

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
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
  });

  const onSubmit = async () => {
    setIsSuccess(true);
    setTimeout(() => {
      navigate({ to: "/dashboard" });
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="relative min-h-screen text-noir">
        <InteractiveBackground />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 text-center shadow-lg">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 font-display text-3xl text-noir">Password updated.</h1>
            <p className="mt-2 text-sm leading-relaxed text-noir/65">
              Your password has been changed successfully. Redirecting you to the dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="animate-fade-up rounded-2xl border border-noir/15 bg-card p-8 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-crimson/10 text-crimson">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-xs italic text-crimson">Security</span>
              <h1 className="font-display text-2xl text-noir">Choose new password</h1>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-noir/65">
                New password
              </label>
              <input
                {...register("password")}
                type="password"
                className="mt-1 w-full rounded-xl border border-noir/20 bg-background px-4 py-2.5 text-sm text-noir focus:border-crimson focus:outline-none"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-crimson">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-noir/65">
                Confirm new password
              </label>
              <input
                {...register("confirmPassword")}
                type="password"
                className="mt-1 w-full rounded-xl border border-noir/20 bg-background px-4 py-2.5 text-sm text-noir focus:border-crimson focus:outline-none"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-crimson">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-crimson py-3 text-sm font-medium text-cream transition hover:bg-wine disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating password...
                </>
              ) : (
                <>
                  Update password
                  <ArrowUpRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
