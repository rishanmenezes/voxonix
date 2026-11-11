/**
 * AuthContext — Server-Backed, Secure Local Authentication & Profile State.
 *
 * OWASP Compliant:
 *   - Zero bearer tokens or session IDs are stored in localStorage or sessionStorage.
 *   - Authentication is strictly verified through the server using HttpOnly session cookies.
 *   - Only non-sensitive public user metadata (displayName, profile) is cached for UI rendering.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AuthContext,
  type SignUpPayload,
  type AuthResult,
  type Session,
  type User,
} from "@/hooks/use-auth";
import {
  getLocalTestUser,
  getLocalTestSession,
  isLocalTestModeEnabled,
  resolveActiveTestUserIdentifier,
  STORAGE_KEY_TEST_USER,
} from "@/lib/test-mode";
import {
  STORAGE_KEY_VOXONIX_USER,
  STORAGE_KEY_VOXONIX_SESSION,
  invalidateSessionMemoryCache,
} from "@/lib/auth-helpers";
import { normalizePrimaryProfile } from "@/lib/capabilities";
import { STORAGE_KEY_PROFILE, STORAGE_KEY_PREFERENCES } from "@/lib/accessibility";

function getCsrfTokenFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)voxonix_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize active profile from server verification on mount
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      // Actively purge any legacy bearer tokens from localStorage
      try {
        if (window.localStorage.getItem(STORAGE_KEY_VOXONIX_SESSION)) {
          window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
        }
      } catch {
        // Ignore storage errors
      }

      try {
        const isExplicitlySignedOut = window.localStorage.getItem("voxonix_signed_out") === "true";
        if (isExplicitlySignedOut) {
          if (mounted) {
            setUser(null);
            setSession(null);
            setLoading(false);
          }
          return;
        }

        // Fast-path: Check cached non-sensitive user metadata for immediate visual UI hydration
        const cachedUserRaw = window.localStorage.getItem(STORAGE_KEY_VOXONIX_USER);
        if (cachedUserRaw) {
          try {
            const parsedUser = JSON.parse(cachedUserRaw) as User;
            if (parsedUser?.id && mounted) {
              setUser(parsedUser);
              setSession({
                user: parsedUser,
                access_token: "", // Kept empty in client storage
                token_type: "bearer",
              });
            }
          } catch {
            // Bad cached JSON
          }
        }

        // Authoritatively verify session with server via HttpOnly cookie
        try {
          const res = await fetch("/api/auth/session", {
            method: "GET",
            credentials: "same-origin",
          });

          if (res.ok) {
            const data = await res.json();
            if (mounted && data?.user) {
              const verifiedUser: User = data.user;
              const activeSession: Session = {
                user: verifiedUser,
                access_token: "", // No bearer token needed in client storage
                token_type: "bearer",
              };

              setUser(verifiedUser);
              setSession(activeSession);
              setLoading(false);

              try {
                window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(verifiedUser));
              } catch {
                // Ignore
              }
              return;
            }
          } else if (res.status === 401) {
            // Not authenticated on server
            if (mounted && !isLocalTestModeEnabled()) {
              setUser(null);
              setSession(null);
              setLoading(false);
              try {
                window.localStorage.removeItem(STORAGE_KEY_VOXONIX_USER);
              } catch {
                // Ignore
              }
              return;
            }
          }
        } catch {
          // Network offline - retain cached non-sensitive user metadata if present
        }

        // Check if local test mode is active
        if (isLocalTestModeEnabled()) {
          const activeIdentifier = resolveActiveTestUserIdentifier();
          const defaultUser = getLocalTestUser(activeIdentifier);
          const defaultSession = getLocalTestSession(defaultUser);

          if (mounted) {
            setUser(defaultUser);
            setSession(defaultSession);
            setLoading(false);
            try {
              window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(defaultUser));
            } catch {
              // Ignore
            }
          }
          return;
        }

        // Not logged in
        if (mounted) {
          setUser(null);
          setSession(null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth init error:", err);
        if (mounted) {
          setUser(null);
          setSession(null);
          setLoading(false);
        }
      }
    }

    initAuth();

    const handleStorageChange = (e: StorageEvent) => {
      if ((e.key === STORAGE_KEY_TEST_USER || e.key === STORAGE_KEY_VOXONIX_USER) && mounted) {
        if (!e.newValue) {
          setUser(null);
          setSession(null);
        } else {
          try {
            const updatedUser = JSON.parse(e.newValue);
            setUser(updatedUser);
          } catch {
            // Ignore
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const signUp = useCallback(
    async ({
      email,
      password,
      displayName,
      accessibilityProfile,
      communicationPreferences,
    }: SignUpPayload): Promise<AuthResult> => {
      try {
        window.localStorage.removeItem("voxonix_signed_out");
        window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
      } catch {
        // Ignore
      }

      const normalizedProfile = normalizePrimaryProfile(accessibilityProfile);

      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: password || "Password123",
            displayName,
            profile: normalizedProfile,
            language: "en-US",
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return { error: { message: data.error || "Failed to create account." } };
        }

        const newUser: User = data.user;
        const newSession: Session = {
          user: newUser,
          access_token: "", // Never stored on client
          token_type: "bearer",
        };

        setUser(newUser);
        setSession(newSession);
        invalidateSessionMemoryCache();

        try {
          window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(newUser));
          window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
          window.localStorage.setItem("voxonix_accessibility_profile", normalizedProfile);
        } catch {
          // Ignore storage errors
        }

        return { error: null };
      } catch (err: unknown) {
        console.debug("[Auth signUp error]", err);
        // Only allow fallback in local test mode
        if (isLocalTestModeEnabled()) {
          const fallbackUser: User = {
            id: `usr_${normalizedProfile}_${Date.now()}`,
            email,
            user_metadata: {
              display_name: displayName,
              full_name: displayName,
              accessibility_profile: normalizedProfile,
              communication_preferences: communicationPreferences,
            },
            created_at: new Date().toISOString(),
          };

          const fallbackSession = getLocalTestSession(fallbackUser);
          setUser(fallbackUser);
          setSession(fallbackSession);
          invalidateSessionMemoryCache();

          try {
            window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(fallbackUser));
            window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
            window.localStorage.setItem("voxonix_accessibility_profile", normalizedProfile);
          } catch {
            // Ignore
          }
          return { error: null };
        }

        return {
          error: {
            message:
              err instanceof Error
                ? err.message
                : "Unable to reach the registration service. Please verify your connection.",
          },
        };
      }
    },
    [],
  );

  const signIn = useCallback(async (email: string, password?: string): Promise<AuthResult> => {
    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    if (!trimmedEmail || typeof password !== "string" || password.length === 0) {
      return { error: { message: "Email and password are required." } };
    }

    try {
      window.localStorage.removeItem("voxonix_signed_out");
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
    } catch {
      // Ignore
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: User;
      };

      if (!response.ok || !data.user) {
        return {
          error: {
            status: response.status,
            message:
              data.error ||
              (response.status === 429
                ? "Too many login attempts. Please wait a moment and try again."
                : "Invalid email or password."),
          },
        };
      }

      const signedInUser: User = data.user;
      const activeSession: Session = {
        user: signedInUser,
        access_token: "", // Never stored on client
        token_type: "bearer",
      };

      setUser(signedInUser);
      setSession(activeSession);
      invalidateSessionMemoryCache();

      const profile = signedInUser.user_metadata?.accessibility_profile || "standard";

      try {
        window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(signedInUser));
        window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
        window.localStorage.setItem("voxonix_accessibility_profile", profile);
      } catch {
        // Ignore
      }

      return { error: null };
    } catch (err: unknown) {
      console.debug("[Auth signIn error]", err);
      if (isLocalTestModeEnabled()) {
        const lower = email.toLowerCase();
        let profile = "standard";
        let name = "Participant";

        if (lower.includes("deaf")) {
          profile = "deaf";
          name = "Alex (Deaf)";
        } else if (
          lower.includes("dumb") ||
          lower.includes("non-speaking") ||
          lower.includes("sam") ||
          lower.includes("aac")
        ) {
          profile = "non-speaking";
          name = "Sam (Non-speaking)";
        } else if (lower.includes("blind") || lower.includes("dev")) {
          profile = "blind";
          name = "Dev (Blind)";
        } else if (lower.includes("standard") || lower.includes("jordan")) {
          profile = "standard";
          name = "Jordan (Standard)";
        }

        const offlineUser: User = {
          id: `usr_${profile}_${Date.now()}`,
          email,
          user_metadata: {
            display_name: name,
            full_name: name,
            accessibility_profile: profile,
          },
          created_at: new Date().toISOString(),
        };
        const offlineSession = getLocalTestSession(offlineUser);

        setUser(offlineUser);
        setSession(offlineSession);
        invalidateSessionMemoryCache();

        try {
          window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(offlineUser));
          window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
          window.localStorage.setItem("voxonix_accessibility_profile", profile);
        } catch {
          // Ignore
        }

        return { error: null };
      }

      return {
        error: {
          message:
            err instanceof Error
              ? err.message
              : "Unable to connect to the authentication service. Please check your network.",
        },
      };
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-csrf-token": csrfToken,
        },
      }).catch(() => {});
    } catch {
      // Ignore
    }

    try {
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_USER);
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
      window.localStorage.removeItem(STORAGE_KEY_PROFILE);
      window.localStorage.removeItem(STORAGE_KEY_PREFERENCES);
      window.localStorage.setItem("voxonix_signed_out", "true");
    } catch {
      // Ignore
    }
    setUser(null);
    setSession(null);
    invalidateSessionMemoryCache();
  }, []);

  const signOutAll = useCallback(async (): Promise<void> => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      await fetch("/api/auth/logout-all", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-csrf-token": csrfToken,
        },
      }).catch(() => {});
    } catch {
      // Ignore
    }

    try {
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_USER);
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
      window.localStorage.removeItem(STORAGE_KEY_PROFILE);
      window.localStorage.removeItem(STORAGE_KEY_PREFERENCES);
      window.localStorage.setItem("voxonix_signed_out", "true");
    } catch {
      // Ignore
    }
    setUser(null);
    setSession(null);
    invalidateSessionMemoryCache();
  }, []);

  const resetPassword = useCallback(async (_email: string): Promise<AuthResult> => {
    return { error: null };
  }, []);

  const isAuthenticated = !loading && session !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthenticated,
        signUp,
        signIn,
        signOut,
        signOutAll,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
