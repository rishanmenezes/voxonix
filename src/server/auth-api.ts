import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import {
  registerUser,
  authenticateUser,
  verifySessionToken,
  revokeSessionToken,
  revokeAllUserSessions,
  toPublicUser,
  KdfQueueFullError,
} from "./db";
import { type PrimaryProfile } from "../lib/capabilities";
import { authRateLimiter } from "./rate-limiter";

const EMAIL_VALIDATION_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const SUPPORTED_REGISTRATION_PROFILES = new Set(["deaf", "non-speaking", "blind", "standard"]);

function validateRegistrationBody(body: AuthRequestBody):
  | {
      ok: true;
      email: string;
      password: string;
      displayName: string;
      profile: PrimaryProfile;
      language?: string;
    }
  | { ok: false; error: string } {
  const { email, password, displayName, profile, language } = body;

  if (!email || typeof email !== "string" || !EMAIL_VALIDATION_RE.test(email.trim())) {
    return { ok: false, error: "A valid email address is required." };
  }
  const trimmedName = typeof displayName === "string" ? displayName.trim() : "";
  if (trimmedName.length < 2 || trimmedName.length > 64) {
    return { ok: false, error: "Name must be between 2 and 64 characters." };
  }
  if (!password || typeof password !== "string" || password.length < 6 || password.length > 256) {
    return { ok: false, error: "Password must be between 6 and 256 characters." };
  }
  const rawProfile = typeof profile === "string" ? profile.trim().toLowerCase() : "";
  if (!SUPPORTED_REGISTRATION_PROFILES.has(rawProfile)) {
    return {
      ok: false,
      error: "Profile must be one of: deaf, non-speaking, blind, or standard.",
    };
  }

  return {
    ok: true,
    email: email.trim(),
    password,
    displayName: trimmedName,
    profile: rawProfile as PrimaryProfile,
    language: typeof language === "string" ? language : undefined,
  };
}

// Rate limit constants (relaxed registration in dev/test for automated QA suites, 5 logins per 60s per OWASP)
const isDevOrTest = process.env.NODE_ENV !== "production";
const MAX_REGISTER_ATTEMPTS = isDevOrTest ? 200 : 10;
const MAX_LOGIN_ATTEMPTS = 5;

interface AuthRequestBody {
  email?: string;
  password?: string;
  displayName?: string;
  profile?: string;
  language?: string;
  [key: string]: unknown;
}

function parseJsonBody(req: IncomingMessage): Promise<AuthRequestBody> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        // 100kb payload limit
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body) as AuthRequestBody);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  extraHeaders?: Record<string, string | string[]>,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(data));
}

function extractCookie(cookieHeader: string | undefined | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function extractToken(authHeader?: string | null, cookieHeader?: string | null): string | null {
  if (authHeader && typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7).trim();
    }
    if (authHeader.startsWith("voxonix-token:") || authHeader.startsWith("vox_sess_")) {
      return authHeader.trim();
    }
  }
  if (cookieHeader) {
    const cookieToken = extractCookie(cookieHeader, "voxonix_session");
    if (cookieToken) return cookieToken;
  }
  return null;
}

export function buildSessionCookie(
  token: string,
  maxAgeSeconds: number = 7 * 24 * 60 * 60,
): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `voxonix_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function buildCsrfCookie(
  csrfToken: string,
  maxAgeSeconds: number = 7 * 24 * 60 * 60,
): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `voxonix_csrf=${csrfToken}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function isHostMatching(originOrRefererUrl: string, expectedHost?: string | null): boolean {
  if (!originOrRefererUrl || !expectedHost) return false;
  try {
    const parsed = new URL(originOrRefererUrl);
    if (parsed.host.toLowerCase() === expectedHost.toLowerCase()) {
      return true;
    }
    const isDev = process.env.NODE_ENV !== "production";
    const parsedPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const [expectedHostname, expectedPort = "80"] = expectedHost.split(":");
    if (
      isDev &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      (expectedHostname === "localhost" || expectedHostname === "127.0.0.1") &&
      parsedPort === expectedPort
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface CsrfCheckResult {
  valid: boolean;
  error?: string;
}

export function checkCsrfProtection(
  method: string,
  headers: {
    secFetchSite?: string | null;
    origin?: string | null;
    referer?: string | null;
    host?: string | null;
    csrfHeader?: string | null;
    csrfCookie?: string | null;
    hasCookieAuth?: boolean;
    hasBearerAuth?: boolean;
  },
): CsrfCheckResult {
  const isStateChanging =
    method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  if (!isStateChanging) return { valid: true };

  // 1. Sec-Fetch-Site Metadata Defense
  if (headers.secFetchSite === "cross-site") {
    return { valid: false, error: "Cross-site request blocked by Sec-Fetch-Site." };
  }

  // 2. Strict Origin verification
  if (headers.origin !== undefined && headers.origin !== null) {
    if (headers.origin === "null") {
      return { valid: false, error: "Null origin is prohibited for state-changing operations." };
    }
    if (!isHostMatching(headers.origin, headers.host)) {
      return { valid: false, error: "Cross-origin request blocked." };
    }
  } else if (headers.referer) {
    // 3. Strict Referer verification fallback when Origin is omitted
    if (!isHostMatching(headers.referer, headers.host)) {
      return { valid: false, error: "Untrusted Referer header." };
    }
  } else if (headers.hasCookieAuth && !headers.hasBearerAuth) {
    // 4. Missing both Origin and Referer for cookie-authenticated requests
    if (headers.secFetchSite !== "same-origin" && headers.secFetchSite !== "same-site") {
      return { valid: false, error: "Missing origin metadata on cookie-authenticated request." };
    }
  }

  // 5. Synchronizer CSRF Token Defense for cookie-authenticated state-changing operations
  if (headers.hasCookieAuth && !headers.hasBearerAuth && headers.csrfCookie) {
    if (!headers.csrfHeader || headers.csrfHeader !== headers.csrfCookie) {
      return { valid: false, error: "Invalid or missing CSRF synchronizer token." };
    }
  }

  return { valid: true };
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "127.0.0.1";
}

function getFetchClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

/**
 * Connect/Express middleware for Vite dev & preview servers
 */
export async function authMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url || "";
  if (!url.startsWith("/api/auth")) {
    return next();
  }

  const pathname = url.split("?")[0];
  const method = req.method?.toUpperCase() || "GET";
  const clientIp = getClientIp(req);

  const authHeader = req.headers["authorization"] as string | undefined;
  const cookieHeader = req.headers["cookie"] as string | undefined;
  const hasBearerAuth = Boolean(authHeader && authHeader.startsWith("Bearer "));
  const cookieToken = extractCookie(cookieHeader, "voxonix_session");
  const hasCookieAuth = Boolean(cookieToken);
  const csrfCookie = extractCookie(cookieHeader, "voxonix_csrf");
  const csrfHeader = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as
    | string
    | undefined;

  const host =
    (req.headers["host"] as string | undefined) ||
    (req.headers["x-forwarded-host"] as string | undefined) ||
    "localhost:5173";

  const isAuthEntryEndpoint = pathname === "/api/auth/login" || pathname === "/api/auth/register";

  // Strict CSRF Defense
  const csrfCheck = checkCsrfProtection(method, {
    secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
    origin: req.headers["origin"] as string | undefined,
    referer: req.headers["referer"] as string | undefined,
    host,
    csrfHeader,
    csrfCookie,
    hasCookieAuth: !isAuthEntryEndpoint && hasCookieAuth,
    hasBearerAuth,
  });

  if (!csrfCheck.valid) {
    return sendJson(res, 403, { error: csrfCheck.error || "Forbidden." });
  }

  try {
    if (pathname === "/api/auth/csrf-token" && method === "GET") {
      const csrfToken = generateCsrfToken();
      const csrfCookieHeader = buildCsrfCookie(csrfToken);
      return sendJson(res, 200, { csrfToken }, { "Set-Cookie": csrfCookieHeader });
    }

    if (pathname === "/api/auth/register" && method === "POST") {
      // Rate limit registrations: max 10 per 60 seconds per IP (relaxed in dev/test)
      const rate = authRateLimiter.check(`register:${clientIp}`, MAX_REGISTER_ATTEMPTS, 60000);
      if (!rate.allowed) {
        return sendJson(
          res,
          429,
          { error: `Too many registration attempts. Please wait ${rate.retryAfterSeconds}s.` },
          { "Retry-After": String(rate.retryAfterSeconds) },
        );
      }

      const body = await parseJsonBody(req);
      const validated = validateRegistrationBody(body);
      if (!validated.ok) {
        return sendJson(res, 400, { error: validated.error });
      }

      try {
        const result = await registerUser({
          email: validated.email,
          password: validated.password,
          displayName: validated.displayName,
          profile: validated.profile,
          language: validated.language,
        });

        const publicUser = toPublicUser(result.user);
        const sessionCookie = buildSessionCookie(result.token);
        const csrfToken = generateCsrfToken();
        const csrfCookie = buildCsrfCookie(csrfToken);

        return sendJson(
          res,
          201,
          {
            user: publicUser,
            session: {
              access_token: result.token,
              token_type: "bearer",
              user: publicUser,
            },
            csrfToken,
          },
          { "Set-Cookie": [sessionCookie, csrfCookie] },
        );
      } catch (err: unknown) {
        if (err instanceof KdfQueueFullError) {
          return sendJson(
            res,
            503,
            { error: err.message },
            { "Retry-After": String(err.retryAfterSeconds) },
          );
        }
        throw err;
      }
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await parseJsonBody(req);
      const { email, password } = body;

      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        return sendJson(res, 400, { error: "Email and password are required." });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const rate = authRateLimiter.check(
        `login:${clientIp}:${normalizedEmail}`,
        MAX_LOGIN_ATTEMPTS,
        60000,
      );
      if (!rate.allowed) {
        return sendJson(
          res,
          429,
          { error: `Too many login attempts. Please wait ${rate.retryAfterSeconds} seconds.` },
          { "Retry-After": String(rate.retryAfterSeconds) },
        );
      }

      try {
        const result = await authenticateUser(normalizedEmail, password);
        authRateLimiter.reset(`login:${clientIp}:${normalizedEmail}`);

        const publicUser = toPublicUser(result.user);
        const sessionCookie = buildSessionCookie(result.token);
        const csrfToken = generateCsrfToken();
        const csrfCookie = buildCsrfCookie(csrfToken);

        return sendJson(
          res,
          200,
          {
            user: publicUser,
            session: {
              access_token: result.token,
              token_type: "bearer",
              user: publicUser,
            },
            csrfToken,
          },
          { "Set-Cookie": [sessionCookie, csrfCookie] },
        );
      } catch (err: unknown) {
        if (err instanceof KdfQueueFullError) {
          return sendJson(
            res,
            503,
            { error: err.message },
            { "Retry-After": String(err.retryAfterSeconds) },
          );
        }
        const errorMsg = err instanceof Error ? err.message : "Invalid credentials.";
        return sendJson(res, 401, { error: errorMsg });
      }
    }

    if (pathname === "/api/auth/session" && method === "GET") {
      const token = extractToken(authHeader, cookieHeader);

      if (!token) {
        return sendJson(res, 401, { error: "No authentication token provided." });
      }

      const user = verifySessionToken(token);
      if (!user) {
        return sendJson(res, 401, { error: "Session invalid or expired." });
      }

      const publicUser = toPublicUser(user);
      return sendJson(res, 200, {
        user: publicUser,
        session: {
          access_token: token,
          token_type: "bearer",
          user: publicUser,
        },
      });
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      const token = extractToken(authHeader, cookieHeader);

      if (token) {
        await revokeSessionToken(token);
      }

      const clearSession = buildSessionCookie("", 0);
      const clearCsrf = buildCsrfCookie("", 0);
      return sendJson(
        res,
        200,
        { message: "Signed out successfully." },
        { "Set-Cookie": [clearSession, clearCsrf] },
      );
    }

    if (pathname === "/api/auth/logout-all" && method === "POST") {
      const token = extractToken(authHeader, cookieHeader);

      if (!token) {
        return sendJson(res, 401, { error: "No authentication token provided." });
      }

      const user = verifySessionToken(token);
      if (!user) {
        return sendJson(res, 401, { error: "Session invalid or expired." });
      }

      const revokedCount = await revokeAllUserSessions(user.id);
      const clearSession = buildSessionCookie("", 0);
      const clearCsrf = buildCsrfCookie("", 0);

      return sendJson(
        res,
        200,
        { message: "Signed out of all devices successfully.", revokedCount },
        { "Set-Cookie": [clearSession, clearCsrf] },
      );
    }

    if (pathname === "/api/auth/personas" && method === "GET") {
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 404, {
          error: "Personas endpoint is disabled in production environments.",
        });
      }

      return sendJson(res, 200, {
        personas: [
          {
            email: "deaf@voxonix.com",
            displayName: "Alex (Deaf)",
            profile: "deaf",
            description: "Visual communication, captions, ISL reference, sign recognition",
          },
          {
            email: "nonspeaking@voxonix.com",
            displayName: "Sam (Non-speaking)",
            profile: "non-speaking",
            description: "Native AAC communication board, custom phrases, synthesized call voice",
          },
          {
            email: "blind@voxonix.com",
            displayName: "Dev (Blind)",
            profile: "blind",
            description:
              "Screen reader first, voice-guided navigation, TTS audio readout, Braille feed",
          },
          {
            email: "standard@voxonix.com",
            displayName: "Jordan (Standard)",
            profile: "standard",
            description: "Standard audio/video calling, device selection, basic chat",
          },
        ],
      });
    }

    return sendJson(res, 404, { error: "Auth endpoint not found" });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    console.error("[Auth API error]:", error);
    return sendJson(res, 500, { error: errorMsg });
  }
}

/**
 * Web Fetch API handler for TanStack Start SSR server
 */
export async function handleAuthFetchRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const clientIp = getFetchClientIp(request);

  const jsonHeaders: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };

  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");
  const hasBearerAuth = Boolean(authHeader && authHeader.startsWith("Bearer "));
  const cookieToken = extractCookie(cookieHeader, "voxonix_session");
  const hasCookieAuth = Boolean(cookieToken);
  const csrfCookie = extractCookie(cookieHeader, "voxonix_csrf");
  const csrfHeader = request.headers.get("x-csrf-token") || request.headers.get("x-xsrf-token");

  const host = request.headers.get("host") || url.host || "localhost:5173";

  const isAuthEntryEndpoint = pathname === "/api/auth/login" || pathname === "/api/auth/register";

  // Strict CSRF Defense
  const csrfCheck = checkCsrfProtection(method, {
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    host,
    csrfHeader,
    csrfCookie,
    hasCookieAuth: !isAuthEntryEndpoint && hasCookieAuth,
    hasBearerAuth,
  });

  if (!csrfCheck.valid) {
    return new Response(JSON.stringify({ error: csrfCheck.error || "Forbidden." }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    if (pathname === "/api/auth/csrf-token" && method === "GET") {
      const csrfToken = generateCsrfToken();
      const csrfCookieHeader = buildCsrfCookie(csrfToken);
      return new Response(JSON.stringify({ csrfToken }), {
        status: 200,
        headers: { ...jsonHeaders, "Set-Cookie": csrfCookieHeader },
      });
    }

    if (pathname === "/api/auth/register" && method === "POST") {
      const rate = authRateLimiter.check(`register:${clientIp}`, MAX_REGISTER_ATTEMPTS, 60000);
      if (!rate.allowed) {
        return new Response(
          JSON.stringify({
            error: `Too many registration attempts. Please wait ${rate.retryAfterSeconds}s.`,
          }),
          {
            status: 429,
            headers: { ...jsonHeaders, "Retry-After": String(rate.retryAfterSeconds) },
          },
        );
      }

      const body = ((await request.json().catch(() => ({}))) || {}) as AuthRequestBody;
      const validated = validateRegistrationBody(body);
      if (!validated.ok) {
        return new Response(JSON.stringify({ error: validated.error }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      try {
        const result = await registerUser({
          email: validated.email,
          password: validated.password,
          displayName: validated.displayName,
          profile: validated.profile,
          language: validated.language,
        });

        const publicUser = toPublicUser(result.user);
        const sessionCookie = buildSessionCookie(result.token);
        const csrfToken = generateCsrfToken();
        const csrfCookie = buildCsrfCookie(csrfToken);

        const responseHeaders = new Headers(jsonHeaders);
        responseHeaders.append("Set-Cookie", sessionCookie);
        responseHeaders.append("Set-Cookie", csrfCookie);

        return new Response(
          JSON.stringify({
            user: publicUser,
            session: {
              access_token: result.token,
              token_type: "bearer",
              user: publicUser,
            },
            csrfToken,
          }),
          { status: 201, headers: responseHeaders },
        );
      } catch (err: unknown) {
        if (err instanceof KdfQueueFullError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 503,
            headers: { ...jsonHeaders, "Retry-After": String(err.retryAfterSeconds) },
          });
        }
        throw err;
      }
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const body = ((await request.json().catch(() => ({}))) || {}) as AuthRequestBody;
      const { email, password } = body;

      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        return new Response(JSON.stringify({ error: "Email and password are required." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const rate = authRateLimiter.check(
        `login:${clientIp}:${normalizedEmail}`,
        MAX_LOGIN_ATTEMPTS,
        60000,
      );
      if (!rate.allowed) {
        return new Response(
          JSON.stringify({
            error: `Too many login attempts. Please wait ${rate.retryAfterSeconds} seconds.`,
          }),
          {
            status: 429,
            headers: { ...jsonHeaders, "Retry-After": String(rate.retryAfterSeconds) },
          },
        );
      }

      try {
        const result = await authenticateUser(normalizedEmail, password);
        authRateLimiter.reset(`login:${clientIp}:${normalizedEmail}`);

        const publicUser = toPublicUser(result.user);
        const sessionCookie = buildSessionCookie(result.token);
        const csrfToken = generateCsrfToken();
        const csrfCookie = buildCsrfCookie(csrfToken);

        const responseHeaders = new Headers(jsonHeaders);
        responseHeaders.append("Set-Cookie", sessionCookie);
        responseHeaders.append("Set-Cookie", csrfCookie);

        return new Response(
          JSON.stringify({
            user: publicUser,
            session: {
              access_token: result.token,
              token_type: "bearer",
              user: publicUser,
            },
            csrfToken,
          }),
          { status: 200, headers: responseHeaders },
        );
      } catch (err: unknown) {
        if (err instanceof KdfQueueFullError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 503,
            headers: { ...jsonHeaders, "Retry-After": String(err.retryAfterSeconds) },
          });
        }
        const errorMsg = err instanceof Error ? err.message : "Invalid credentials.";
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
    }

    if (pathname === "/api/auth/session" && method === "GET") {
      const token = extractToken(authHeader, cookieHeader);

      if (!token) {
        return new Response(JSON.stringify({ error: "No authentication token provided." }), {
          status: 401,
          headers: jsonHeaders,
        });
      }

      const user = verifySessionToken(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Session invalid or expired." }), {
          status: 401,
          headers: jsonHeaders,
        });
      }

      const publicUser = toPublicUser(user);
      return new Response(
        JSON.stringify({
          user: publicUser,
          session: {
            access_token: token,
            token_type: "bearer",
            user: publicUser,
          },
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      const token = extractToken(authHeader, cookieHeader);

      if (token) {
        await revokeSessionToken(token);
      }

      const clearSession = buildSessionCookie("", 0);
      const clearCsrf = buildCsrfCookie("", 0);
      const responseHeaders = new Headers(jsonHeaders);
      responseHeaders.append("Set-Cookie", clearSession);
      responseHeaders.append("Set-Cookie", clearCsrf);

      return new Response(JSON.stringify({ message: "Signed out successfully." }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    if (pathname === "/api/auth/logout-all" && method === "POST") {
      const token = extractToken(authHeader, cookieHeader);

      if (!token) {
        return new Response(JSON.stringify({ error: "No authentication token provided." }), {
          status: 401,
          headers: jsonHeaders,
        });
      }

      const user = verifySessionToken(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Session invalid or expired." }), {
          status: 401,
          headers: jsonHeaders,
        });
      }

      const revokedCount = await revokeAllUserSessions(user.id);
      const clearSession = buildSessionCookie("", 0);
      const clearCsrf = buildCsrfCookie("", 0);
      const responseHeaders = new Headers(jsonHeaders);
      responseHeaders.append("Set-Cookie", clearSession);
      responseHeaders.append("Set-Cookie", clearCsrf);

      return new Response(
        JSON.stringify({ message: "Signed out of all devices successfully.", revokedCount }),
        { status: 200, headers: responseHeaders },
      );
    }

    if (pathname === "/api/auth/personas" && method === "GET") {
      if (process.env.NODE_ENV === "production") {
        return new Response(
          JSON.stringify({
            error: "Personas endpoint is disabled in production environments.",
          }),
          { status: 404, headers: jsonHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          personas: [
            {
              email: "deaf@voxonix.com",
              displayName: "Alex (Deaf)",
              profile: "deaf",
              description: "Visual communication, captions, ISL reference, sign recognition",
            },
            {
              email: "nonspeaking@voxonix.com",
              displayName: "Sam (Non-speaking)",
              profile: "non-speaking",
              description: "Native AAC communication board, custom phrases, synthesized call voice",
            },
            {
              email: "blind@voxonix.com",
              displayName: "Dev (Blind)",
              profile: "blind",
              description:
                "Screen reader first, voice-guided navigation, TTS audio readout, Braille feed",
            },
            {
              email: "standard@voxonix.com",
              displayName: "Jordan (Standard)",
              profile: "standard",
              description: "Standard audio/video calling, device selection, basic chat",
            },
          ],
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ error: "Auth endpoint not found" }), {
      status: 404,
      headers: jsonHeaders,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    console.error("[Auth API error]:", error);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}
