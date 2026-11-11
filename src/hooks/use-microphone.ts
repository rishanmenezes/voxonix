import { useState, useRef, useCallback, useEffect } from "react";
import {
  type MicrophoneState,
  type MicrophoneDeviceInfo,
  requestMicrophoneStream,
  stopMicrophoneStream,
  extractMicrophoneInfo,
} from "@/lib/media/microphone";

const DEFAULT_DEVICE_INFO: MicrophoneDeviceInfo = {
  label: "None",
  readyState: "unknown",
  enabled: false,
  muted: false,
};

export function useMicrophone() {
  const [state, setState] = useState<MicrophoneState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [inputLevel, setInputLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<MicrophoneDeviceInfo>(DEFAULT_DEVICE_INFO);

  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<MicrophoneState>("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Helper: tear down Web Audio API nodes
  const teardownAudioGraph = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    }
    setInputLevel(0);
  }, []);

  // Helper: stop tracks and clear stream refs
  const releaseStream = useCallback(() => {
    teardownAudioGraph();
    if (streamRef.current) {
      stopMicrophoneStream(streamRef.current);
      streamRef.current = null;
    }
    setStream(null);
  }, [teardownAudioGraph]);

  // Web Audio API analyzer setup
  const setupAudioGraph = useCallback((mediaStream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current || !streamRef.current) return;

        // If track is disabled/muted, level is 0
        const audioTrack = streamRef.current.getAudioTracks()[0];
        if (!audioTrack || !audioTrack.enabled) {
          setInputLevel(0);
        } else {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          // Normalize 0..255 average to 0.00..1.00 with visual scaling
          const normalized = Math.min(1, Math.max(0, (average / 128) * 1.5));
          setInputLevel(normalized);
        }

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      animFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (e) {
      console.warn("Failed to initialize Web Audio API analyzer:", e);
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    releaseStream();
    stateRef.current = "stopped";
    setState("stopped");
    setIsMuted(false);
    setDeviceInfo(DEFAULT_DEVICE_INFO);
  }, [releaseStream]);

  const startMicrophone = useCallback(async () => {
    if (stateRef.current === "live" || stateRef.current === "requesting") return;

    releaseStream();

    stateRef.current = "requesting";
    setState("requesting");
    setError(null);

    try {
      const newStream = await requestMicrophoneStream();
      const audioTrack = newStream.getAudioTracks()[0];

      if (!audioTrack) {
        stopMicrophoneStream(newStream);
        throw new Error("No audio track was returned by the microphone.");
      }

      streamRef.current = newStream;
      setStream(newStream);
      setIsMuted(!audioTrack.enabled);
      stateRef.current = "live";
      setState("live");
      setDeviceInfo(extractMicrophoneInfo(newStream));

      setupAudioGraph(newStream);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      stateRef.current = "error";
      setState("error");
      streamRef.current = null;
      setStream(null);
    }
  }, [releaseStream, setupAudioGraph]);

  const restartMicrophone = useCallback(async () => {
    releaseStream();
    stateRef.current = "idle";
    setState("idle");
    setDeviceInfo(DEFAULT_DEVICE_INFO);
    await startMicrophone();
  }, [releaseStream, startMicrophone]);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    const muted = !newEnabled;
    setIsMuted(muted);
    setDeviceInfo(extractMicrophoneInfo(streamRef.current));
  }, []);

  // Cleanup on unmount.
  // CRITICAL: reset stateRef so startMicrophone() can run again on remount
  // (React Strict Mode double-invoke).  releaseStream() nulls streamRef but
  // does not reset stateRef — without this fix the mic never restarts.
  useEffect(() => {
    return () => {
      releaseStream();
      stateRef.current = "idle";
    };
  }, [releaseStream]);

  return {
    state,
    stream,
    isMuted,
    inputLevel,
    error,
    deviceInfo,
    startMicrophone,
    stopMicrophone,
    restartMicrophone,
    toggleMute,
    retryMicrophone: startMicrophone,
  };
}
