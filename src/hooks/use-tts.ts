import { createContext, useContext } from "react";
import type { TTSConfig, TTSVoice } from "@/lib/tts/types";

export const TTS_STORAGE_KEY = "voxonix.ttsConfig";

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

export const DEFAULT_TTS_CONFIG: TTSConfig = {
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

export const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function useTTS(): TTSContextType {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTS must be used within a TTSContextProvider");
  }
  return context;
}
