import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CameraPreview } from "@/components/media/CameraPreview";
import { MicrophonePreview } from "@/components/media/MicrophonePreview";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/media-test")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Local Media Integration Test — VOXONIX" },
      {
        name: "description",
        content: "Simultaneous camera and microphone subsystem verification page.",
      },
    ],
  }),
  component: MediaTestPage,
});

function MediaTestPage() {
  return (
    <div className="relative min-h-screen text-noir">
      <InteractiveBackground />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 sm:pt-8">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg text-noir hover:text-crimson transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>
        <div className="text-right">
          <span className="font-display text-xl italic text-wine">Voxonix</span>
          <span className="ml-2 rounded-md bg-crimson/10 px-2 py-0.5 text-xs font-semibold text-crimson">
            PHASE 1.2
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 space-y-12">
        <div className="text-center">
          <span className="font-display text-xs uppercase tracking-[0.28em] text-crimson">
            Development Integration Test
          </span>
          <h1 className="mt-2 font-display text-4xl text-noir sm:text-5xl">
            Local Audio / Video Integration
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-noir/70">
            Verify simultaneous operation, stream independence, and non-interfering lifecycle
            teardown of local camera and microphone subsystems.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Camera Subsystem Section */}
          <div className="space-y-4">
            <div className="border-b border-noir/10 pb-2">
              <h2 className="font-display text-2xl text-noir">1. Camera Subsystem</h2>
              <p className="text-xs text-noir/60">Independent video feed capture & rendering</p>
            </div>
            <CameraPreview />
          </div>

          {/* Microphone Subsystem Section */}
          <div className="space-y-4">
            <div className="border-b border-noir/10 pb-2">
              <h2 className="font-display text-2xl text-noir">2. Microphone Subsystem</h2>
              <p className="text-xs text-noir/60">
                Independent audio feed & Web Audio API analyzer
              </p>
            </div>
            <MicrophonePreview />
          </div>
        </div>
      </main>
    </div>
  );
}
