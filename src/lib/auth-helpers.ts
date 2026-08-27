/**
 * Authentication helper utilities for TanStack Router.
 *
 * Provides:
 *   - requireAuth() — beforeLoad guard that redirects unauthenticated users
 *   - redirectIfAuthenticated() — beforeLoad guard that redirects authenticated users
 */

import { redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase/client";

/**
 * Route guard for authenticated-only routes.
 * Use in beforeLoad to redirect unauthenticated users to /login.
 *
 * Example:
 *   export const Route = createFileRoute('/dashboard')({
 *     beforeLoad: requireAuth,
 *     component: Dashboard,
 *   });
 *
 * @param opts - TanStack Router context with location
 * @returns Redirect to /login if not authenticated
 */
export async function requireAuth(opts: { location: { href: string; pathname?: string } }) {
  if (typeof window === "undefined") {
    return {};
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Preserve the original destination so we can redirect back after login
    let currentPath = opts.location.href || "/dashboard";
    try {
      const url = new URL(opts.location.href, "http://localhost");
      currentPath = url.pathname + url.search;
    } catch {
      currentPath = opts.location.href;
    }
    throw redirect({
      to: "/login",
      search: { redirect: currentPath },
    });
  }

  return { session };
}

/**
 * Route guard for public-only routes (login, register).
 * Use in beforeLoad to redirect authenticated users to /dashboard.
 *
 * Example:
 *   export const Route = createFileRoute('/login')({
 *     beforeLoad: redirectIfAuthenticated,
 *     component: LoginPage,
 *   });
 *
 * @returns Redirect to /dashboard if authenticated
 */
export async function redirectIfAuthenticated() {
  if (typeof window === "undefined") {
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    throw redirect({ to: "/dashboard" });
  }
}
