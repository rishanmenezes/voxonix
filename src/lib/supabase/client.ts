/**
 * Supabase browser client for TanStack Start.
 *
 * Uses @supabase/ssr's createBrowserClient which automatically:
 *   - Reads and writes auth cookies in the browser
 *   - Refreshes tokens before expiry
 *   - Syncs session state across tabs
 *
 * Environment variables (defined in .env.local):
 *   VITE_SUPABASE_URL            — your project URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY — your project's public/publishable key
 *
 * The publishable key is safe to expose in the browser — it is scoped by
 * Row Level Security policies in your Supabase project.
 * NEVER put the service-role key in client-side code.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns the initialized Supabase browser client.
 * Validates environment variables on invocation and throws an actionable configuration error if missing.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    | string
    | undefined;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase environment variables.\n" +
        "Copy .env.local.example → .env.local and set:\n" +
        "  VITE_SUPABASE_URL\n" +
        "  VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  _client = createBrowserClient(supabaseUrl, supabasePublishableKey);
  return _client;
}

/**
 * Lazy proxy to the browser Supabase client.
 * Defers client creation and environment validation until first access.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseBrowserClient();
    const value = Reflect.get(client, prop);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
