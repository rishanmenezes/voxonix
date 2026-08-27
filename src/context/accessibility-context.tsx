import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type AccessibilityProfile,
  type AccessibilityProfileInfo,
  type CommunicationPreferences,
  ACCESSIBILITY_PROFILES,
  ALL_PROFILES_LIST,
  STORAGE_KEY_PROFILE,
  STORAGE_KEY_PREFERENCES,
  DEFAULT_PREFERENCES_BY_PROFILE,
  normalizeAccessibilityProfile,
  normalizeCommunicationPreferences,
} from "@/lib/accessibility";
import { useAuth } from "./auth-context";
import { supabase } from "@/lib/supabase/client";

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

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  // Always initialize with standard safe defaults for SSR hydration safety
  const [profile, setProfileState] = useState<AccessibilityProfile | null>(null);
  const [preferences, setPreferencesState] = useState<CommunicationPreferences>(
    DEFAULT_PREFERENCES_BY_PROFILE.standard,
  );

  // ── Sync from Auth metadata (authoritative) or LocalStorage (cache fallback) ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check authoritative authenticated user metadata first
    if (isAuthenticated && user?.user_metadata) {
      const authProfile = normalizeAccessibilityProfile(user.user_metadata.accessibility_profile);
      const authPrefs = user.user_metadata.communication_preferences;

      if (authProfile) {
        setProfileState(authProfile);
        const resolvedPrefs = normalizeCommunicationPreferences(authPrefs, authProfile);
        setPreferencesState(resolvedPrefs);

        // Update local cache to match authoritative cloud state
        try {
          localStorage.setItem(STORAGE_KEY_PROFILE, authProfile);
          localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(resolvedPrefs));
        } catch {
          // Ignore cache write errors
        }
        return;
      }
    }

    // 2. Fall back to local cached preferences if unauthenticated or metadata not set yet
    try {
      const cachedProfile = normalizeAccessibilityProfile(localStorage.getItem(STORAGE_KEY_PROFILE));
      let cachedPrefs: unknown = null;
      const rawPrefs = localStorage.getItem(STORAGE_KEY_PREFERENCES);
      if (rawPrefs) {
        try {
          cachedPrefs = JSON.parse(rawPrefs);
        } catch {
          // Ignore parse errors
        }
      }

      if (cachedProfile) {
        setProfileState(cachedProfile);
        setPreferencesState(normalizeCommunicationPreferences(cachedPrefs, cachedProfile));
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [user, isAuthenticated]);

  // ── Storage change listener across tabs ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_PROFILE) {
        const validated = normalizeAccessibilityProfile(e.newValue);
        setProfileState(validated);
        if (validated) {
          setPreferencesState((prev) => normalizeCommunicationPreferences(prev, validated));
        }
      } else if (e.key === STORAGE_KEY_PREFERENCES && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPreferencesState((prev) => normalizeCommunicationPreferences(parsed, profile));
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [profile]);

  // ── Action: Set Profile with defaults + optional overrides ───────────────────
  const setProfile = useCallback(
    async (
      newProfile: AccessibilityProfile | string | null,
      customPreferences?: Partial<CommunicationPreferences>,
    ): Promise<void> => {
      const validated = normalizeAccessibilityProfile(newProfile);
      setProfileState(validated);

      const newPrefs = validated
        ? { ...DEFAULT_PREFERENCES_BY_PROFILE[validated], ...(customPreferences || {}) }
        : DEFAULT_PREFERENCES_BY_PROFILE.standard;

      setPreferencesState(newPrefs);

      // 1. Cache locally
      if (typeof window !== "undefined") {
        try {
          if (validated) {
            localStorage.setItem(STORAGE_KEY_PROFILE, validated);
            localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(newPrefs));
          } else {
            localStorage.removeItem(STORAGE_KEY_PROFILE);
            localStorage.removeItem(STORAGE_KEY_PREFERENCES);
          }
        } catch (err) {
          console.warn("Failed to write accessibility profile to localStorage cache:", err);
        }
      }

      // 2. Persist authoritatively to Supabase if user is logged in
      if (isAuthenticated && user) {
        try {
          await supabase.auth.updateUser({
            data: {
              accessibility_profile: validated,
              communication_preferences: newPrefs,
            },
          });
        } catch (err) {
          console.warn("Failed to update profile in Supabase auth metadata:", err);
        }
      }
    },
    [isAuthenticated, user],
  );

  // ── Action: Update individual preferences ────────────────────────────────────
  const updatePreferences = useCallback(
    async (patch: Partial<CommunicationPreferences>): Promise<void> => {
      const updated = { ...preferences, ...patch };
      setPreferencesState(updated);

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(updated));
        } catch {
          // Ignore
        }
      }

      if (isAuthenticated && user) {
        try {
          await supabase.auth.updateUser({
            data: {
              communication_preferences: updated,
            },
          });
        } catch (err) {
          console.warn("Failed to update preferences in Supabase auth metadata:", err);
        }
      }
    },
    [preferences, isAuthenticated, user],
  );

  const profileInfo = profile ? ACCESSIBILITY_PROFILES[profile] || null : null;

  const getCurrentAccessibilityProfile = useCallback((): AccessibilityProfileInfo | null => {
    if (!profile) return null;
    return ACCESSIBILITY_PROFILES[profile] || null;
  }, [profile]);

  return (
    <AccessibilityContext.Provider
      value={{
        profile,
        profileInfo,
        preferences,
        allProfiles: ALL_PROFILES_LIST,
        setProfile,
        updatePreferences,
        getCurrentAccessibilityProfile,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
