import { createContext, useContext } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import type { CommunicationPreferences } from "@/lib/accessibility";

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

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
