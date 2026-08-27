import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SignRecognitionConfig } from "@/lib/vision/types";

const SIGN_STORAGE_KEY = "voxonix.signConfig";

export interface SignRecognitionContextType {
  config: SignRecognitionConfig;
  updateConfig: (patch: Partial<SignRecognitionConfig>) => void;
  toggleSignRecognition: () => void;
}

const DEFAULT_CONFIG: SignRecognitionConfig = {
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

const SignRecognitionContext = createContext<SignRecognitionContextType | undefined>(undefined);

export function SignRecognitionProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SignRecognitionConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(SIGN_STORAGE_KEY);
      if (stored) {
        setConfigState((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch (err) {
      console.warn("[SignRecognitionContext] Error reading localStorage config:", err);
    }
  }, []);

  const updateConfig = useCallback((patch: Partial<SignRecognitionConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(SIGN_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const toggleSignRecognition = useCallback(() => {
    setConfigState((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(SIGN_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  return (
    <SignRecognitionContext.Provider
      value={{
        config,
        updateConfig,
        toggleSignRecognition,
      }}
    >
      {children}
    </SignRecognitionContext.Provider>
  );
}

export function useSignRecognitionContext(): SignRecognitionContextType {
  const ctx = useContext(SignRecognitionContext);
  if (!ctx) {
    throw new Error("useSignRecognitionContext must be used within a SignRecognitionProvider");
  }
  return ctx;
}
