import { useEffect, useRef, useState, useCallback } from "react";
import { HandLandmarkDetector } from "@/lib/vision/hand-landmark-detector";
import { SignClassificationEngine } from "@/lib/vision/sign-classification-engine";
import { runEmpiricalSignerBenchmark } from "@/lib/vision/benchmark";
import type {
  SignClassificationResult,
  SignTelemetry,
  VisionObservation,
  BenchmarkEvaluationResult,
} from "@/lib/vision/types";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";
import { useSignRecognitionContext } from "@/context/sign-recognition-context";

declare global {
  interface Window {
    __VOXONIX_SIGN_TELEMETRY__?: SignTelemetry;
    __VOXONIX_RUN_BENCHMARK__?: () => BenchmarkEvaluationResult;
  }
}

interface UseSignRecognitionProps {
  localPeerId: string;
  localDisplayName?: string;
  isCameraLive: boolean;
  getVideoElement: () => HTMLVideoElement | null;
  broadcastCaption?: (caption: CaptionPayload) => void;
}

export function useSignRecognition({
  localPeerId,
  localDisplayName = "You",
  isCameraLive,
  getVideoElement,
  broadcastCaption,
}: UseSignRecognitionProps) {
  const { config } = useSignRecognitionContext();
  const detectorRef = useRef<HandLandmarkDetector | null>(null);
  const engineRef = useRef<SignClassificationEngine | null>(null);
  const isLoopRunningRef = useRef(false);
  const animFrameIdRef = useRef<number | null>(null);

  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [telemetry, setTelemetry] = useState<SignTelemetry | null>(null);
  const [currentResult, setCurrentResult] = useState<SignClassificationResult | null>(null);
  const [lastObservation, setLastObservation] = useState<VisionObservation | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkEvaluationResult | null>(null);

  // Initialize engine and detector
  useEffect(() => {
    const engine = new SignClassificationEngine({
      localPeerId,
      localDisplayName,
      initialConfig: config,
      onSignDetected: (result) => {
        setCurrentResult(result);
      },
      onWordFinalized: (caption) => {
        if (broadcastCaption) {
          broadcastCaption(caption);
        }
      },
      onTelemetry: (tel) => {
        setTelemetry(tel);
        if (typeof window !== "undefined") {
          window.__VOXONIX_SIGN_TELEMETRY__ = tel;
        }
      },
    });

    const detector = new HandLandmarkDetector();
    engineRef.current = engine;
    detectorRef.current = detector;

    if (typeof window !== "undefined") {
      window.__VOXONIX_RUN_BENCHMARK__ = () => {
        const res = runEmpiricalSignerBenchmark();
        setBenchmarkResult(res);
        return res;
      };
    }

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      isLoopRunningRef.current = false;
      engine.destroy();
      detector.close();
      engineRef.current = null;
      detectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPeerId, localDisplayName]);

  // Sync config
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig(config);
    }
  }, [config]);

  // Lazy load MediaPipe model when enabled and camera is live
  useEffect(() => {
    if (!config.enabled || !isCameraLive) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      isLoopRunningRef.current = false;
      return;
    }

    let isMounted = true;

    async function setupDetector() {
      const detector = detectorRef.current;
      if (!detector) return;

      if (!isModelReady) {
        setIsModelLoading(true);
        try {
          // Initialize in asynchronous LIVE_STREAM mode
          await detector.initialize((obs) => {
            if (!isMounted) return;
            setLastObservation(obs);
            const engine = engineRef.current;
            if (engine) {
              if (obs.hands.length > 0) {
                engine.evaluateHand(obs.hands[0], obs.timestamp, obs.pose, obs.face, obs.bimanual);
              } else {
                engine.evaluateHand(
                  { handedness: "Right", landmarks: [], score: 0 },
                  obs.timestamp,
                  obs.pose,
                  obs.face,
                  obs.bimanual,
                );
              }
            }
          });

          if (isMounted) {
            setIsModelReady(true);
            setIsModelLoading(false);
            startInferenceLoop();
          }
        } catch (err) {
          console.error("[useSignRecognition] Model loading failure:", err);
          if (isMounted) {
            setIsModelLoading(false);
          }
        }
      } else {
        startInferenceLoop();
      }
    }

    setupDetector();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enabled, isCameraLive, isModelReady]);

  // Frame processing loop (asynchronously dispatches frames in LIVE_STREAM mode)
  const startInferenceLoop = useCallback(() => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;

    const processLoop = async () => {
      if (!isLoopRunningRef.current) return;

      const video = getVideoElement();
      const detector = detectorRef.current;

      if (video && detector && video.readyState >= 2 && !video.paused) {
        try {
          const timestamp = performance.now();
          await detector.processFrame(video, timestamp);
        } catch (err) {
          console.warn("[useSignRecognition] Loop frame error:", err);
        }
      }

      if (isLoopRunningRef.current) {
        animFrameIdRef.current = requestAnimationFrame(processLoop);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(processLoop);
  }, [getVideoElement]);

  const finalizeWord = useCallback(() => {
    engineRef.current?.finalizeBufferedWord();
  }, []);

  const backspace = useCallback(() => {
    engineRef.current?.backspace();
  }, []);

  const clearBuffer = useCallback(() => {
    engineRef.current?.clearBuffer();
  }, []);

  const runBenchmark = useCallback(() => {
    const res = runEmpiricalSignerBenchmark();
    setBenchmarkResult(res);
    return res;
  }, []);

  return {
    isModelLoading,
    isModelReady,
    telemetry,
    currentResult,
    lastObservation,
    benchmarkResult,
    finalizeWord,
    backspace,
    clearBuffer,
    runBenchmark,
  };
}
