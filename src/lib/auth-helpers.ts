/**
 * Authentication helper utilities for TanStack Router (Registration-First Architecture).
 *
 * Provides:
 *   - requireAuth() — beforeLoad guard that requires an active session or redirects to /login
 *   - redirectIfAuthenticated() — beforeLoad guard for sign-in pages
 *
 * Security:
 *   - Strictly adheres to OWASP guidelines: No access tokens or session IDs are stored in localStorage/sessionStorage.
 *   - Authentication is verified authoritatively via the server using HttpOnly session cookies.
 */

import { redirect } from "@tanstack/react-router";
import type { Session, User } from "@/hooks/use-auth";
import { getLocalTestSession, isLocalTestModeEnabled } from "@/lib/test-mode";

export const STORAGE_KEY_VOXONIX_USER = "voxonix_user_profile";
// Deprecated legacy key - kept only for cleanup of stale tokens from previous versions
export const STORAGE_KEY_VOXONIX_SESSION = "voxonix_user_session";

// Short in-memory cache to memoize session verification across rapid route changes (5s TTL)
let memorySessionCache: { session: Session | null; timestamp: number } | null = null;
let inflightSessionCheck: Promise<Session | null> | null = null;

export function invalidateSessionMemoryCache(): void {
  memorySessionCache = null;
  inflightSessionCheck = null;
}

/**
 * Returns the effective user session verified authoritatively by the server.
 * Never stores or reads bearer access tokens from localStorage.
 */
export async function getEffectiveSession(): Promise<Session | null> {
  if (typeof window === "undefined") {
    return isLocalTestModeEnabled() ? getLocalTestSession() : null;
  }

  // Actively remove any legacy tokens stored in localStorage from earlier versions
  try {
    if (window.localStorage.getItem(STORAGE_KEY_VOXONIX_SESSION)) {
      window.localStorage.removeItem(STORAGE_KEY_VOXONIX_SESSION);
    }
  } catch {
    // Ignore storage errors
  }

  try {
    const isSignedOut = window.localStorage.getItem("voxonix_signed_out") === "true";
    if (isSignedOut) {
      memorySessionCache = null;
      return null;
    }

    // Check memory cache (5s TTL) to prevent duplicate fetch storms during navigation
    const now = Date.now();
    if (memorySessionCache && now - memorySessionCache.timestamp < 5000) {
      return memorySessionCache.session;
    }

    // Deduplicate in-flight session checks
    if (inflightSessionCheck) {
      return inflightSessionCheck;
    }

    inflightSessionCheck = (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            const verifiedSession: Session = {
              user: data.user,
              access_token: "", // Kept empty in client memory - HttpOnly cookie handles transport
              token_type: "bearer",
            };
            memorySessionCache = { session: verifiedSession, timestamp: Date.now() };

            // Cache non-sensitive public user profile metadata for instant UI display
            try {
              window.localStorage.setItem(STORAGE_KEY_VOXONIX_USER, JSON.stringify(data.user));
            } catch {
              // Ignore storage errors
            }
            return verifiedSession;
          }
        } else if (res.status === 401) {
          memorySessionCache = { session: null, timestamp: Date.now() };
          try {
            window.localStorage.removeItem(STORAGE_KEY_VOXONIX_USER);
          } catch {
            // Ignore
          }
          return null;
        }
      } catch {
        // Network offline fallback: check if we have non-sensitive cached user metadata
        const storedUser = window.localStorage.getItem(STORAGE_KEY_VOXONIX_USER);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser) as User;
            if (parsedUser?.id) {
              return {
                user: parsedUser,
                access_token: "",
                token_type: "bearer",
              };
            }
          } catch {
            // Bad JSON
          }
        }
      } finally {
        inflightSessionCheck = null;
      }

      return null;
    })();

    const result = await inflightSessionCheck;
    return result;
  } catch {
    // Top-level failure
  }

  // If local test mode is explicitly enabled via environment variable, allow test session
  if (isLocalTestModeEnabled()) {
    const defaultSession = getLocalTestSession();
    return defaultSession;
  }

  return null;
}

/**
 * Route guard for authenticated-only routes.
 * Redirects unauthenticated visitors to /login?redirect=...
 */
export async function requireAuth(opts: { location: { href: string; pathname?: string } }) {
  const session = await getEffectiveSession();
  if (!session) {
    throw redirect({
      to: "/login",
      search: {
        redirect: opts.location.href,
      },
    });
  }
  return { session };
}

/**
 * Route guard for public-only routes (login, register).
 */
export async function redirectIfAuthenticated() {
  const session = await getEffectiveSession();
  if (session && !isLocalTestModeEnabled()) {
    throw redirect({
      to: "/dashboard",
    });
  }
}
