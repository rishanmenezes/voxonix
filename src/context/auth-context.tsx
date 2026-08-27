/**
 * AuthContext — centralized Supabase authentication state.
 *
 * Exposes:
 *   user            — the authenticated Supabase User or null
 *   session         — the current Session or null
 *   loading         — true while the initial session check is in flight
 *   isAuthenticated — derived: session !== null && !loading
 *   signUp()        — create a new account
 *   signIn()        — sign in with email + password
 *   signOut()       — end the session
 *   resetPassword() — send a password-reset email
 *
 * SSR / hydration safety:
 *   The initial state is always { user: null, session: null, loading: true }.
 *   This matches the server render so React never sees a hydration mismatch.
 *   On the client, getSession() resolves quickly from localStorage and sets
 *   loading=false before the user sees anything interactive.
 *
 *   supabase.auth.onAuthStateChange() keeps the context in sync for:
 *     - email-confirmation redirects
 *     - token refresh
 *     - sign-out from another tab
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

import type { CommunicationPreferences } from "@/lib/accessibility";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignUpPayload {
  email: string;
  password: string;
  displayName: string;
  accessibilityProfile?: string;
  communicationPreferences?: CommunicationPreferences | Record<string, unknown>;
}

export interface AuthResult {
  error: AuthError | null;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  /** True while the initial session is being loaded from storage. */
  loading: boolean;
  /** True when there is an active, loaded session. */
  isAuthenticated: boolean;
  signUp: (payload: SignUpPayload) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Always start from the "loading" state so SSR and client renders agree.
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // On mount: read the persisted session and subscribe to future changes.
  useEffect(() => {
    let mounted = true;

    // Read the current session from localStorage (fast, synchronous via Supabase SDK).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Keep state in sync whenever Supabase fires an auth event:
    //   SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED,
    //   PASSWORD_RECOVERY, INITIAL_SESSION
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const signUp = useCallback(
    async ({
      email,
      password,
      displayName,
      accessibilityProfile,
      communicationPreferences,
    }: SignUpPayload): Promise<AuthResult> => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            // Stored in auth.users.raw_user_meta_data — readable by the client.
            display_name: displayName,
            accessibility_profile: accessibilityProfile ?? null,
            communication_preferences: communicationPreferences ?? null,
          },
        },
      });
      return { error };
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Redirect the user back to the app after clicking the reset link.
      redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/reset-password`,
    });
    return { error };
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
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
