import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { setupSignalingServer } from "./src/server/signaling-server";

function signalingPlugin(): Plugin {
  return {
    name: "voxonix-signaling-plugin",
    configureServer(server) {
      if (server.httpServer) {
        setupSignalingServer(server.httpServer);
      }
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
