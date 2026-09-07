import { createContext, useContext } from "react";
import type { SignRecognitionConfig } from "@/lib/vision/types";

export const SIGN_STORAGE_KEY = "voxonix.signConfig";

export interface SignRecognitionContextType {
  config: SignRecognitionConfig;
  updateConfig: (patch: Partial<SignRecognitionConfig>) => void;
  toggleSignRecognition: () => void;
}

export const DEFAULT_SIGN_CONFIG: SignRecognitionConfig = {
  enabled: false,
  mode: "all",
  vocabularyTier: "production-safe",
  stabilityThresholdMs: 350,
  minConfidence: 0.6,
  minMargin: 0.2,
  autoSpaceTimeoutMs: 1800,
  repeatHoldIntervalMs: 1100,
  showHUD: true,
  enablePoseContext: true,
  enableFaceContext: true,
};

export const SignRecognitionContext = createContext<SignRecognitionContextType | undefined>(
  undefined,
);

export function useSignRecognitionContext(): SignRecognitionContextType {
  const ctx = useContext(SignRecognitionContext);
  if (!ctx) {
    throw new Error("useSignRecognitionContext must be used within a SignRecognitionProvider");
  }
  return ctx;
}
