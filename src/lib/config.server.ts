import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    deepgramModel: process.env.DEEPGRAM_MODEL || "nova-3",
    gnaniApiKey: process.env.GNANI_API_KEY,
    gnaniSttUrl: process.env.GNANI_STT_URL || "https://api.vachana.ai/stt/v3",
    gnaniWsUrl: process.env.GNANI_WS_URL || "wss://api.vachana.ai/stt/v3/stream",
    gnaniTtsUrl: process.env.GNANI_TTS_URL || "https://api.vachana.ai/api/v1/tts/inference",
    gnaniTtsSseUrl: process.env.GNANI_TTS_SSE_URL || "https://api.vachana.ai/api/v1/tts/sse",
  };
}
