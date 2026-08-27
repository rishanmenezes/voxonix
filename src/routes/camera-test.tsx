import { createFileRoute, Link } from "@tanstack/react-router";
import { CameraPreview } from "@/components/media/CameraPreview";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/camera-test")({
  head: () => ({
    meta: [
      { title: "Camera Subsystem Test — VOXONIX" },
      { name: "description", content: "Isolated camera subsystem verification page." },
    ],
  }),
  component: CameraTestPage,
});

function CameraTestPage() {
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
            PHASE 1.0
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 text-center">
          <span className="font-display text-xs uppercase tracking-[0.28em] text-crimson">
            Development Subsystem Test
          </span>
          <h1 className="mt-2 font-display text-4xl text-noir sm:text-5xl">
            Local Camera Subsystem
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-noir/70">
            Verify permission request, MediaStream binding, track lifecycle, and device diagnostics.
          </p>
        </div>

        <CameraPreview />
      </main>
    </div>
  );
}
