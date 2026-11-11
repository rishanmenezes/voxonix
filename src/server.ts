import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleAuthFetchRequest } from "./server/auth-api";
import { handleGnaniFetchRequest } from "./server/gnani-service";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Block any attempt to access raw persistent data or environment files
      if (
        url.pathname.startsWith("/data") ||
        url.pathname.includes("voxonix-db") ||
        url.pathname.endsWith(".json") ||
        url.pathname.includes(".env")
      ) {
        return new Response(JSON.stringify({ error: "Access denied: protected resource." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname.startsWith("/api/auth")) {
        return await handleAuthFetchRequest(request);
      }

      if (url.pathname.startsWith("/api/ai/gnani")) {
        return await handleGnaniFetchRequest(request);
      }

      if (url.pathname.startsWith("/api/ai")) {
        return new Response(
          JSON.stringify({ error: "Deprecated AI endpoint removed. Use /api/ai/gnani/*." }),
          { status: 410, headers: { "Content-Type": "application/json" } },
        );
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
