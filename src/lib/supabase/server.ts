/**
 * Supabase server client for TanStack Start SSR.
 *
 * Uses @supabase/ssr's createServerClient to read and write auth cookies
 * during server-side rendering. This allows SSR routes to access the
 * authenticated user's session.
 *
 * Usage in a TanStack Start loader or server function:
 *
 *   import { createServerSupabase } from '@/lib/supabase/server';
 *
 *   export const loader = async ({ request }) => {
 *     const supabase = createServerSupabase(request);
 *     const { data: { user } } = await supabase.auth.getUser();
 *     return { user };
 *   };
 *
 * NEVER use this client in browser/client code — it expects node:http APIs.
 * Use src/lib/supabase/client.ts in React components instead.
 */

import { createServerClient } from "@supabase/ssr";

/**
 * Creates a Supabase server client scoped to a single request.
 * Reads cookies from the request and writes refreshed cookies to the response.
 *
 * @param request - The incoming Web Request object (from TanStack Start loader/action)
 * @returns A Supabase client instance that can read/write server-side auth cookies
 */
export function createServerSupabase(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase environment variables on server.\n" +
        "Ensure .env.local is loaded and contains:\n" +
        "  VITE_SUPABASE_URL\n" +
        "  VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const responseHeaders = new Headers();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      get(name: string) {
        const cookieHeader = request.headers.get("cookie") ?? "";
        const cookies = Object.fromEntries(
          cookieHeader.split("; ").map((c) => {
            const [key, ...v] = c.split("=");
            return [key, v.join("=")];
          }),
        );
        return cookies[name];
      },
      set(name: string, value: string, options) {
        let cookie = `${name}=${value}`;
        if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`;
        if (options?.path) cookie += `; Path=${options.path}`;
        if (options?.domain) cookie += `; Domain=${options.domain}`;
        if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`;
        if (options?.secure) cookie += `; Secure`;
        if (options?.httpOnly) cookie += `; HttpOnly`;

        responseHeaders.append("Set-Cookie", cookie);
      },
      remove(name: string, options) {
        let cookie = `${name}=; Max-Age=0`;
        if (options?.path) cookie += `; Path=${options.path}`;
        if (options?.domain) cookie += `; Domain=${options.domain}`;

        responseHeaders.append("Set-Cookie", cookie);
      },
    },
  });

  return { supabase, responseHeaders };
}
