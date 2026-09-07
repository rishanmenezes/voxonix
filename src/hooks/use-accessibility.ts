import { createContext, useContext } from "react";
import type {
  AccessibilityProfile,
  AccessibilityProfileInfo,
  CommunicationPreferences,
} from "@/lib/accessibility";

export interface AccessibilityContextType {
  profile: AccessibilityProfile | null;
  profileInfo: AccessibilityProfileInfo | null;
  preferences: CommunicationPreferences;
  allProfiles: AccessibilityProfileInfo[];
  setProfile: (
    newProfile: AccessibilityProfile | string | null,
    customPreferences?: Partial<CommunicationPreferences>,
  ) => Promise<void>;
  updatePreferences: (patch: Partial<CommunicationPreferences>) => Promise<void>;
  getCurrentAccessibilityProfile: () => AccessibilityProfileInfo | null;
}

export const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
