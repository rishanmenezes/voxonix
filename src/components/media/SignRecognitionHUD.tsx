import { useEffect, useRef } from "react";
import type { VisionObservation, SignClassificationResult } from "@/lib/vision/types";
import { Hand, Check, Sparkles, Delete, Send } from "lucide-react";

interface SignRecognitionHUDProps {
  observation: VisionObservation | null;
  result: SignClassificationResult | null;
  bufferedWord?: string;
  stabilityThresholdMs?: number;
  onFinalize?: () => void;
  onBackspace?: () => void;
  onClear?: () => void;
  className?: string;
}

// 21-point Hand Landmark Skeleton Connections
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm Base
  [0, 17],
];

export function SignRecognitionHUD({
  observation,
  result,
  bufferedWord = "",
  stabilityThresholdMs = 350,
  onFinalize,
  onBackspace,
  onClear,
  className = "",
}: SignRecognitionHUDProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw landmark wireframe on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas internal resolution to client display size
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!observation || observation.hands.length === 0) return;

    for (const hand of observation.hands) {
      const landmarks = hand.landmarks;
      if (!landmarks || landmarks.length < 21) continue;

      // Draw skeleton connections
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(114, 47, 55, 0.75)"; // Wine accent

      for (const [i, j] of HAND_CONNECTIONS) {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      }

      // Draw landmark joint points
      for (let i = 0; i < landmarks.length; i++) {
        const pt = landmarks[i];
        const isTip = [4, 8, 12, 16, 20].includes(i);

        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, isTip ? 4.5 : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = isTip ? "#c41e3a" : "#fdfbf7"; // Crimson tip, Cream joints
        ctx.fill();
        ctx.strokeStyle = "#1a1818";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [observation]);

  const hasDetectedSign = result && result.label !== "None";
  const progressRatio = hasDetectedSign
    ? Math.min(1.0, result.stableDurationMs / stabilityThresholdMs)
    : 0;

  return (
    <div className={`pointer-events-none absolute inset-0 z-20 ${className}`}>
      {/* Hand Landmark Skeleton Canvas */}
      <canvas ref={canvasRef} className="h-full w-full opacity-80" />

      {/* Top Sign Classification Badge */}
      {hasDetectedSign && (
        <div className="absolute top-2 left-2 pointer-events-auto animate-in fade-in zoom-in-90 duration-150">
          <div className="flex items-center gap-2 rounded-2xl border border-wine/30 bg-card/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-wine text-cream font-bold text-sm shadow">
              {result.category === "static-fingerspelling" ? (
                <span>{result.label}</span>
              ) : (
                <Sparkles className="h-4 w-4 text-amber-300" />
              )}
            </div>

            <div className="flex flex-col pr-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-noir">
                <span>{result.label}</span>
                <span className="text-[9px] text-noir/50 uppercase font-mono">
                  ({result.category === "static-fingerspelling" ? "ASL" : "Gesture"})
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-noir/60 font-mono">
                <span>Conf: {Math.round(result.confidence * 100)}%</span>
              </div>
            </div>

            {/* Hold progress ring / bar */}
            <div className="w-10 h-1.5 bg-noir/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-crimson transition-all duration-75"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Assembled Word Buffer Bar */}
      {bufferedWord && (
        <div className="absolute bottom-2 inset-x-2 pointer-events-auto flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 rounded-2xl border border-noir/15 bg-card/95 px-3 py-1.5 shadow-2xl backdrop-blur-xl">
            <span className="flex items-center gap-1 text-xs font-semibold text-wine">
              <Hand className="h-3.5 w-3.5" /> Word:
            </span>
            <span className="font-mono text-xs font-bold tracking-wider text-noir px-1.5 py-0.5 bg-background rounded-lg border border-noir/10">
              {bufferedWord}
            </span>

            <div className="flex items-center gap-1 pl-1">
              {onBackspace && (
                <button
                  type="button"
                  onClick={onBackspace}
                  className="rounded-lg p-1 text-noir/60 hover:bg-noir/10 hover:text-noir transition"
                  title="Backspace"
                >
                  <Delete className="h-3.5 w-3.5" />
                </button>
              )}
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold text-noir/60 hover:bg-noir/10 hover:text-noir transition"
                >
                  Clear
                </button>
              )}
              {onFinalize && (
                <button
                  type="button"
                  onClick={onFinalize}
                  className="inline-flex items-center gap-1 rounded-lg bg-crimson px-2.5 py-1 text-[10px] font-bold text-cream hover:bg-wine shadow-sm transition"
                  title="Commit & Send Word"
                >
                  <Send className="h-3 w-3" />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
