import {
  VAD_SPEECH_RMS_THRESHOLD,
  computeAudioRms,
  downsampleTo16kHz,
  type SegmenterFrameOptions,
  type WakeUtteranceSegmenter,
} from "./blind-voice-wake";

const WORKLET_PROCESSOR_NAME = "voxonix-local-wake-pcm-processor";

// Worklet runs in the Web Audio thread: gates out idle room silence before crossing to the main thread.
// Keeps ~450ms pre-roll and emits ~2000ms trailing hangover after speech stops (using hardware sampleRate)
// so dynamic VAD silenceHangMs (up to ~1200ms in spelling/password modes) always flushes cleanly without starving.
const WORKLET_RMS_GATE = Math.max(0.0045, VAD_SPEECH_RMS_THRESHOLD * 0.55);

const INLINE_WORKLET_CODE = `
class VoxonixLocalWakePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48000;
    this._chunkSize = 2048;
    this._buffer = new Float32Array(this._chunkSize);
    this._offset = 0;
    this._preRoll = [];
    this._maxPreRoll = Math.max(8, Math.ceil((0.45 * sr) / this._chunkSize));
    this._hangoverChunks = 0;
    this._hangoverLimit = Math.max(24, Math.ceil((2.0 * sr) / this._chunkSize));
    this._gateRms = ${WORKLET_RMS_GATE};
  }
  _emitChunk(chunk) {
    this.port.postMessage(chunk, [chunk.buffer]);
  }
  process(inputs) {
    const input = inputs && inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this._buffer[this._offset++] = input[i];
      if (this._offset >= this._chunkSize) {
        let sumSq = 0;
        for (let j = 0; j < this._chunkSize; j++) {
          const s = this._buffer[j];
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / this._chunkSize);
        const chunk = this._buffer.slice(0);
        this._offset = 0;

        if (rms >= this._gateRms) {
          if (this._hangoverChunks === 0 && this._preRoll.length > 0) {
            for (let p = 0; p < this._preRoll.length; p++) {
              this._emitChunk(this._preRoll[p]);
            }
            this._preRoll.length = 0;
          }
          this._hangoverChunks = this._hangoverLimit;
          this._emitChunk(chunk);
        } else if (this._hangoverChunks > 0) {
          this._hangoverChunks--;
          this._emitChunk(chunk);
        } else {
          this._preRoll.push(chunk);
          if (this._preRoll.length > this._maxPreRoll) {
            this._preRoll.shift();
          }
        }
      }
    }
    return true;
  }
}
registerProcessor("${WORKLET_PROCESSOR_NAME}", VoxonixLocalWakePcmProcessor);
`;

export interface LocalAudioCaptureHandle {
  audioContext: AudioContext;
  resumeIfSuspended: () => Promise<void>;
  dispose: () => Promise<void>;
}

/**
 * Attaches a low-overhead mono Web Audio capture pipeline to an active MediaStream.
 * Prefers off-thread AudioWorkletNode with worklet-side silence gating (0 main-thread messages in silence)
 * and falls back cleanly to ScriptProcessorNode when AudioWorklet is unavailable.
 */
export async function createLocalAudioCapturePipeline(
  stream: MediaStream,
  segmenter: WakeUtteranceSegmenter,
  options: {
    shouldIgnoreAudio: () => boolean;
    isActiveAssistantMode: () => boolean;
    getSegmenterOptions?: () => SegmenterFrameOptions;
    onVolume: (rms: number) => void;
    onUtterance: (utterance: { audio: Float32Array; meanRms: number; peakRms: number }) => void;
  },
): Promise<LocalAudioCaptureHandle> {
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioCtx = window.AudioContext || win.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Web Audio API is unavailable in this browser.");
  }

  let audioContext: AudioContext;
  try {
    audioContext = new AudioCtx({ latencyHint: "playback" });
  } catch {
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(() => {});
  }

  const source = audioContext.createMediaStreamSource(stream);

  // Route through zero-gain sink so capture graph stays active without speaker audio feedback
  const silentSink = audioContext.createGain();
  silentSink.gain.value = 0;
  silentSink.connect(audioContext.destination);

  let workletNode: AudioWorkletNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let workletBlobUrl: string | null = null;
  let disposed = false;

  // Stateful 1-pole DC blocker / high-pass (~55Hz cutoff) eliminates laptop mic DC offset and fan rumble
  const sampleRate = audioContext.sampleRate || 48000;
  const dcPole = Math.max(0.97, 1 - (2 * Math.PI * 55) / sampleRate);
  let dcPrevX = 0;
  let dcPrevY = 0;

  const handlePcmChunk = (rawSamples: Float32Array) => {
    if (disposed) return;

    const filtered = new Float32Array(rawSamples.length);
    for (let i = 0; i < rawSamples.length; i++) {
      const x = rawSamples[i];
      const y = x - dcPrevX + dcPole * dcPrevY;
      dcPrevX = x;
      dcPrevY = y;
      filtered[i] = y > 1 ? 1 : y < -1 ? -1 : y;
    }

    const rms = computeAudioRms(filtered);
    options.onVolume(rms);

    if (options.shouldIgnoreAudio()) {
      segmenter.reset();
      dcPrevX = 0;
      dcPrevY = 0;
      return;
    }

    const resampled16k = downsampleTo16kHz(filtered, sampleRate);
    const frameOpts = options.getSegmenterOptions
      ? options.getSegmenterOptions()
      : options.isActiveAssistantMode();
    const utterance = segmenter.push16kHzFrame(resampled16k, frameOpts);
    if (utterance) {
      options.onUtterance(utterance);
    }
  };

  if (audioContext.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    try {
      const blob = new Blob([INLINE_WORKLET_CODE], { type: "application/javascript" });
      workletBlobUrl = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(workletBlobUrl);
      workletNode = new AudioWorkletNode(audioContext, WORKLET_PROCESSOR_NAME);
      workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (e.data instanceof Float32Array) {
          handlePcmChunk(e.data);
        }
      };
      source.connect(workletNode);
      workletNode.connect(silentSink);
    } catch {
      // Clean fallback if AudioWorklet registration fails in restricted browser environments
      workletNode = null;
      if (workletBlobUrl) {
        URL.revokeObjectURL(workletBlobUrl);
        workletBlobUrl = null;
      }
    }
  }

  if (!workletNode && typeof audioContext.createScriptProcessor === "function") {
    scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const channelData = event.inputBuffer.getChannelData(0);
      handlePcmChunk(channelData);
    };
    source.connect(scriptNode);
    scriptNode.connect(silentSink);
  }

  return {
    audioContext,
    resumeIfSuspended: async () => {
      if (!disposed && audioContext.state === "suspended") {
        await audioContext.resume().catch(() => {});
      }
    },
    dispose: async () => {
      disposed = true;
      try {
        if (workletNode) {
          workletNode.port.onmessage = null;
          workletNode.disconnect();
        }
        if (scriptNode) {
          scriptNode.onaudioprocess = null;
          scriptNode.disconnect();
        }
        source.disconnect();
        silentSink.disconnect();
        if (workletBlobUrl) {
          URL.revokeObjectURL(workletBlobUrl);
        }
        if (audioContext.state !== "closed") {
          await audioContext.close().catch(() => {});
        }
      } catch {
        // Ignore teardown errors
      }
    },
  };
}
