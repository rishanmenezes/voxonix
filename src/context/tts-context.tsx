import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { TTSConfig, TTSVoice } from "@/lib/tts/types";
import { BrowserTTSProvider } from "@/lib/tts/browser-tts-provider";
import { useAccessibility } from "./accessibility-context";

const TTS_STORAGE_KEY = "voxonix.ttsConfig";

export interface TTSContextType {
  config: TTSConfig;
  voices: TTSVoice[];
  isSupported: boolean;
  isRecommended: boolean;
  updateConfig: (patch: Partial<TTSConfig>) => void;
  toggleTTS: () => void;
  enableWithGesture: () => Promise<boolean>;
  refreshVoices: () => Promise<TTSVoice[]>;
}

const DEFAULT_CONFIG: TTSConfig = {
  enabled: false,
  autoSpeakCaptions: true,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  language: "en-US",
  duckMicDuringSpeech: true,
  audioDeviceMode: "speakers",
  interruptBacklogOnTyped: true,
};

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSContextProvider({ children }: { children: ReactNode }) {
  const { profile } = useAccessibility();
  const providerRef = useRef<BrowserTTSProvider | null>(null);
  if (!providerRef.current) {
    providerRef.current = new BrowserTTSProvider();
  }

  const [config, setConfigState] = useState<TTSConfig>(DEFAULT_CONFIG);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const isSupported = providerRef.current.isSupported();
  const isRecommended = profile === "blind";

  // Load config from localStorage on client mount (Honoring user-gesture consent policy)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(TTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setConfigState((prev) => ({ ...prev, ...parsed }));
      }
      // If profile is blind and user hasn't explicitly set config yet, we keep enabled: false
      // but mark isRecommended: true, ready for the user to activate on join/click.
    } catch (err) {
      console.warn("[TTSContext] Error reading localStorage config:", err);
    }
  }, []);

  // Load available system voices
  useEffect(() => {
    if (providerRef.current && isSupported) {
      providerRef.current.getVoices().then((v) => {
        setVoices(v);
      });
    }
  }, [isSupported]);

  const updateConfig = useCallback((patch: Partial<TTSConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const toggleTTS = useCallback(() => {
    setConfigState((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      if (next.enabled && providerRef.current) {
        providerRef.current.unlock();
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const enableWithGesture = useCallback(async (): Promise<boolean> => {
    if (providerRef.current) {
      await providerRef.current.unlock();
    }
    setConfigState((prev) => {
      const next = { ...prev, enabled: true };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    return true;
  }, []);

  const refreshVoices = useCallback(async (): Promise<TTSVoice[]> => {
    if (!providerRef.current) return [];
    const v = await providerRef.current.getVoices();
    setVoices(v);
    return v;
  }, []);

  return (
    <TTSContext.Provider
      value={{
        config,
        voices,
        isSupported,
        isRecommended,
        updateConfig,
        toggleTTS,
        enableWithGesture,
        refreshVoices,
      }}
    >
      {children}
    </TTSContext.Provider>
  );
}

export function useTTS(): TTSContextType {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTS must be used within a TTSContextProvider");
  }
  return context;
}
