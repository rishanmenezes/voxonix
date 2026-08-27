import { useState, useRef, useCallback, useEffect } from "react";
import {
  type CameraState,
  type CameraDeviceInfo,
  requestCameraStream,
  stopCameraStream,
  extractCameraInfo,
} from "@/lib/media/camera";

const DEFAULT_DEVICE_INFO: CameraDeviceInfo = {
  label: "None",
  readyState: "unknown",
  enabled: false,
};

export function useCamera() {
  const [state, setState] = useState<CameraState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<CameraDeviceInfo>(DEFAULT_DEVICE_INFO);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<CameraState>("idle");

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const updateDeviceInfo = useCallback(() => {
    if (streamRef.current) {
      setDeviceInfo(extractCameraInfo(streamRef.current, videoRef.current));
    }
  }, []);

  const stopCamera = useCallback(() => {
    releaseStream();
    stateRef.current = "stopped";
    setState("stopped");
    setDeviceInfo(DEFAULT_DEVICE_INFO);
  }, [releaseStream]);

  const startCamera = useCallback(async () => {
    if (stateRef.current === "live") return;
    if (stateRef.current === "requesting") return;

    releaseStream();
    stateRef.current = "requesting";
    setState("requesting");
    setError(null);

    try {
      const newStream = await requestCameraStream();
      const videoTracks = newStream.getVideoTracks();
      if (videoTracks.length === 0) {
        stopCameraStream(newStream);
        throw new Error("No video track was returned by the camera.");
      }
      streamRef.current = newStream;
      setStream(newStream);
      stateRef.current = "live";
      setState("live");
      setDeviceInfo(extractCameraInfo(newStream, videoRef.current));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      stateRef.current = "error";
      setState("error");
      streamRef.current = null;
      setStream(null);
    }
  }, [releaseStream]);

  const restartCamera = useCallback(async () => {
    releaseStream();
    stateRef.current = "idle";
    setState("idle");
    setDeviceInfo(DEFAULT_DEVICE_INFO);
    await startCamera();
  }, [releaseStream, startCamera]);

  // Bind stream to <video> element.
  // FIX: always call play() after srcObject assignment — autoPlay alone is
  // unreliable when srcObject is assigned programmatically after mount.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {
        // Autoplay policy blocked — browser will play on next user gesture.
      });
      const handleMetadata = () => updateDeviceInfo();
      videoEl.addEventListener("loadedmetadata", handleMetadata);
      return () => videoEl.removeEventListener("loadedmetadata", handleMetadata);
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, updateDeviceInfo]);

  // Cleanup on unmount.
  // CRITICAL: reset stateRef so startCamera() can run again if the component
  // remounts (e.g. React Strict Mode double-invoke).  Without this reset,
  // stateRef stays "live" after the tracks are stopped, and the guard inside
  // startCamera() (`if (stateRef.current === "live") return`) prevents the
  // camera from ever restarting — producing permanently black local video.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopCameraStream(streamRef.current);
        streamRef.current = null;
      }
      stateRef.current = "idle";
    };
  }, []);

  return {
    state,
    stream,
    error,
    deviceInfo,
    videoRef,
    startCamera,
    stopCamera,
    restartCamera,
    retryCamera: startCamera,
  };
}
