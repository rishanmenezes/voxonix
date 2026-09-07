import { useState, useEffect, useCallback, type ReactNode } from "react";
import type { SignRecognitionConfig } from "@/lib/vision/types";
import {
  SignRecognitionContext,
  SIGN_STORAGE_KEY,
  DEFAULT_SIGN_CONFIG,
} from "@/hooks/use-sign-recognition-context";

export function SignRecognitionProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SignRecognitionConfig>(DEFAULT_SIGN_CONFIG);

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
