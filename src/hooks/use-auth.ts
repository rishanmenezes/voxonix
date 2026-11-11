import { createContext, useContext } from "react";
import type { CommunicationPreferences } from "@/lib/accessibility";

export interface User {
  id: string;
  email?: string;
  user_metadata?: {
    display_name?: string;
    full_name?: string;
    accessibility_profile?: string;
    communication_preferences?: CommunicationPreferences;
    local_test_mode?: boolean;
  };
  created_at?: string;
}

export interface Session {
  user: User;
  access_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  refresh_token?: string;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface SignUpPayload {
  email: string;
  password?: string;
  displayName: string;
  accessibilityProfile?: string;
  communicationPreferences?: CommunicationPreferences;
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
  signIn: (email: string, password?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
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
