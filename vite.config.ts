import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { setupSignalingServer } from "./src/server/signaling-server";

function signalingPlugin(): Plugin {
  const attachSignaling = (server: {
    httpServer?: Parameters<typeof setupSignalingServer>[0] | null;
  }) => {
    if (server.httpServer) {
      setupSignalingServer(server.httpServer);
    }
  };

  return {
    name: "voxonix-signaling-plugin",
    configureServer(server) {
      attachSignaling(server);
    },
    // `vite preview` is the repository's production-like runtime. Attach the
    // same authenticated /ws endpoint there rather than leaving signaling
    // available only during hot-reload development.
    configurePreviewServer(server) {
      attachSignaling(server);
    },
  };
}

export default defineConfig({
  server: {
    // Allow requests from any hostname so cloudflared tunnels and LAN access work.
    // true = accept any Host header. Development testing only — not for production.
    allowedHosts: true,
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
