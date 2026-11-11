import { createContext, useContext } from "react";
import type { BlindVoiceAssistantContextType } from "@/lib/accessibility/blind-voice-wake";

export const BlindVoiceAssistantContext = createContext<BlindVoiceAssistantContextType | undefined>(
  undefined,
);

export function useBlindVoiceAssistant(): BlindVoiceAssistantContextType {
  const context = useContext(BlindVoiceAssistantContext);
  if (!context) {
    throw new Error("useBlindVoiceAssistant must be used within a BlindVoiceAssistantProvider");
  }
  return context;
}
