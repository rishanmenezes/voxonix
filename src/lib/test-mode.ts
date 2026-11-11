/**
 * VOXONIX — Local Sandbox Identity Helper
 *
 * Provides optional tab-isolated sandbox identities during local development
 * when explicitly enabled via VITE_LOCAL_TEST_MODE=true.
 *
 * Default:
 *   OFF (false) — standard local authentication with data/voxonix-db.json.
 */

import type { User, Session } from "@/hooks/use-auth";
import type { AccessibilityProfile } from "./accessibility";

export const LOCAL_TEST_TOKEN_PREFIX = "voxonix-local-test-token:";
export const STORAGE_KEY_TEST_USER = "voxonix_local_test_user";

/**
 * Checks whether local test mode is explicitly enabled.
 * Evaluates both client-side Vite environment and Node.js server environment.
 * Default is strictly false.
 */
export function isLocalTestModeEnabled(): boolean {
  try {
    // Check Vite client-side environment
    if (typeof import.meta !== "undefined" && import.meta.env) {
      if (
        import.meta.env.VITE_LOCAL_TEST_MODE === "true" ||
        import.meta.env.VOXONIX_LOCAL_TEST_MODE === "true" ||
        import.meta.env.VITE_VOXONIX_LOCAL_TEST_MODE === "true"
      ) {
        return true;
      }
    }
  } catch {
    // import.meta may not be accessible in some environments
  }

  try {
    // Check Node/server process environment
    if (typeof process !== "undefined" && process.env) {
      if (
        process.env.VITE_LOCAL_TEST_MODE === "true" ||
        process.env.VOXONIX_LOCAL_TEST_MODE === "true" ||
        process.env.VITE_VOXONIX_LOCAL_TEST_MODE === "true"
      ) {
        return true;
      }
    }
  } catch {
    // process may not be defined
  }

  return false;
}

export interface LocalTestIdentityConfig {
  id: string;
  displayName: string;
  email: string;
  defaultProfile: AccessibilityProfile;
}

export const PRESET_TEST_USERS: Record<string, LocalTestIdentityConfig> = {
  A: {
    id: "usr_test_alpha_01",
    displayName: "Test User A",
    email: "test.user.a@voxonix.local",
    defaultProfile: "standard",
  },
  B: {
    id: "usr_test_beta_02",
    displayName: "Test User B",
    email: "test.user.b@voxonix.local",
    defaultProfile: "deaf",
  },
};

/**
 * Resolves active test user key ("A" | "B" | custom) from:
 * 1. URL query search params (?testUser=A or ?user=B)
 * 2. Tab-isolated sessionStorage
 * 3. Browser-wide localStorage
 * 4. Default to "A"
 */
export function resolveActiveTestUserIdentifier(): string {
  if (typeof window === "undefined") {
    return "A";
  }

  try {
    const url = new URL(window.location.href);
    const queryUser = url.searchParams.get("testUser") || url.searchParams.get("user");
    if (queryUser) {
      const normalized = queryUser.trim();
      if (normalized.toUpperCase() === "A" || normalized.toLowerCase() === "usera") return "A";
      if (normalized.toUpperCase() === "B" || normalized.toLowerCase() === "userb") return "B";
      return normalized;
    }
  } catch {
    // URL parsing fallback
  }

  try {
    const sessionVal = window.sessionStorage?.getItem(STORAGE_KEY_TEST_USER);
    if (sessionVal) return sessionVal;
  } catch {
    // Ignore storage errors
  }

  try {
    const localVal = window.localStorage?.getItem(STORAGE_KEY_TEST_USER);
    if (localVal) return localVal;
  } catch {
    // Ignore storage errors
  }

  return "A";
}

/**
 * Switches the active local test user identity.
 */
export function setActiveTestUserIdentifier(identifier: string): void {
  if (typeof window === "undefined") return;
  const normalized = identifier.trim();
  try {
    window.sessionStorage?.setItem(STORAGE_KEY_TEST_USER, normalized);
    window.localStorage?.setItem(STORAGE_KEY_TEST_USER, normalized);
  } catch {
    // Ignore
  }
}

/**
 * Creates a deterministic local test User object.
 */
export function getLocalTestUser(identifier?: string): User {
  const key = (identifier || resolveActiveTestUserIdentifier()).toUpperCase();
  const preset = PRESET_TEST_USERS[key];

  const config: LocalTestIdentityConfig = preset || {
    id: `usr_test_${identifier?.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "custom"}`,
    displayName: identifier ? `Test User ${identifier}` : "Test User",
    email: `${(identifier || "custom").toLowerCase().replace(/[^a-z0-9_-]/g, "")}@voxonix.local`,
    defaultProfile: "standard",
  };

  const now = new Date().toISOString();

  return {
    id: config.id,
    app_metadata: { provider: "local-test", providers: ["local-test"] },
    user_metadata: {
      display_name: config.displayName,
      full_name: config.displayName,
      accessibility_profile: config.defaultProfile,
      local_test_mode: true,
    },
    aud: "authenticated",
    confirmation_sent_at: now,
    confirmed_at: now,
    created_at: "2026-01-01T00:00:00.000Z",
    email: config.email,
    email_confirmed_at: now,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: now,
    phone: "",
    role: "authenticated",
    updated_at: now,
  } as unknown as User;
}

/**
 * Creates a structured, signed-like test auth token format:
 *   voxonix-local-test-token:<userId>:<encodedDisplayName>
 */
export function createLocalTestAuthToken(user: User): string {
  const displayName =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    "Test User";
  return `${LOCAL_TEST_TOKEN_PREFIX}${user.id}:${encodeURIComponent(displayName)}`;
}

/**
 * Parses and verifies a local test auth token.
 * Returns null if the token format is invalid.
 */
export function parseLocalTestAuthToken(
  token?: string | null,
): { userId: string; displayName: string; email: string } | null {
  if (!token || typeof token !== "string" || !token.startsWith(LOCAL_TEST_TOKEN_PREFIX)) {
    return null;
  }

  const payload = token.slice(LOCAL_TEST_TOKEN_PREFIX.length);
  const colonIndex = payload.indexOf(":");
  if (colonIndex === -1) return null;

  const userId = payload.slice(0, colonIndex);
  const rawDisplayName = payload.slice(colonIndex + 1);
  if (!userId || !rawDisplayName) return null;

  try {
    const displayName = decodeURIComponent(rawDisplayName);
    return {
      userId,
      displayName,
      email: `${userId}@voxonix.local`,
    };
  } catch {
    return null;
  }
}

/**
 * Creates a deterministic local test Session object.
 */
export function getLocalTestSession(user?: User): Session {
  const testUser = user || getLocalTestUser();
  const token = createLocalTestAuthToken(testUser);

  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 86400 * 30, // 30 days
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
    refresh_token: `refresh-${token}`,
    user: testUser,
  };
}
