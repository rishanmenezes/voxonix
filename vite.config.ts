import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { setupSignalingServer } from "./src/server/signaling-server";
import { authMiddleware } from "./src/server/auth-api";
import { gnaniMiddleware, attachGnaniWebSocketProxy } from "./src/server/gnani-service";

function createSecurityAndApiMiddleware() {
  return (
    req: { url?: string },
    res: {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (s: string) => void;
    },
    next: () => void,
  ) => {
    const url = (req.url || "").split("?")[0];
    if (url.startsWith("/data") || url.includes("voxonix-db") || url.endsWith(".json")) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Access denied: protected resource." }));
      return;
    }
    gnaniMiddleware(req as never, res as never, () => {
      authMiddleware(req as never, res as never, next);
    });
  };
}

function signalingPlugin(): Plugin {
  const attachSignaling = (server: {
    httpServer?: Parameters<typeof setupSignalingServer>[0] | null;
  }) => {
    if (server.httpServer) {
      setupSignalingServer(server.httpServer);
      attachGnaniWebSocketProxy(server.httpServer);
    }
  };
  const middleware = createSecurityAndApiMiddleware();

  return {
    name: "voxonix-signaling-plugin",
    configureServer(server) {
      server.middlewares.use(middleware as never);
      attachSignaling(server);
    },
    // `vite preview` is the repository's production-like runtime. Attach the
    // same authenticated /ws endpoint and /api/auth handlers there rather
    // than leaving them available only during hot-reload development.
    configurePreviewServer(server) {
      server.middlewares.use(middleware as never);
      attachSignaling(server);
    },
  };
}

export default defineConfig({
  server: {
    // Allow requests from any hostname so cloudflared tunnels and LAN access work.
    // true = accept any Host header. Development testing only — not for production.
    allowedHosts: true,
    fs: {
      deny: ["**/data/**", "**/package*.json", "**/tsconfig*.json", "**/.env*"],
    },
  },
  plugins: [
    signalingPlugin(),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
