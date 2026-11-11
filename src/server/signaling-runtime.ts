import { createServer } from "node:http";
import { setupSignalingServer } from "./signaling-server";

const port = Number(process.env.SIGNALING_PORT || 8787);

const httpServer = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "voxonix-signaling" }));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("VOXONIX signaling gateway");
});

setupSignalingServer(httpServer);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[signaling-runtime] WebSocket gateway listening on port ${port}`);
});
