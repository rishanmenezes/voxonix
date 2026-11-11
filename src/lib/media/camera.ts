export type CameraState = "idle" | "requesting" | "live" | "stopped" | "error";

export interface CameraDeviceInfo {
  label: string;
  readyState: MediaStreamTrackState | "unknown";
  enabled: boolean;
  width?: number;
  height?: number;
}

export function isMediaDevicesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function")
  );
}

export async function requestCameraStream(): Promise<MediaStream> {
  if (!isMediaDevicesSupported()) {
    throw new Error(
      "Camera access is not available in this browser or context (requires HTTPS or localhost).",
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stopCameraStream(stream);
      throw new Error("No video track found in the returned media stream.");
    }

    return stream;
  } catch (error) {
    throw new Error(mapCameraError(error));
  }
}

export function stopCameraStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

export function extractCameraInfo(
  stream: MediaStream | null,
  videoElement?: HTMLVideoElement | null,
): CameraDeviceInfo {
  if (!stream) {
    return {
      label: "None",
      readyState: "unknown",
      enabled: false,
    };
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    return {
      label: "No Track",
      readyState: "unknown",
      enabled: false,
    };
  }

  const settings = track.getSettings ? track.getSettings() : {};
  const width = videoElement?.videoWidth || settings.width;
  const height = videoElement?.videoHeight || settings.height;

  return {
    label: track.label || "Integrated Camera",
    readyState: track.readyState,
    enabled: track.enabled,
    width,
    height,
  };
}

export function mapCameraError(error: unknown): string {
  if (error instanceof Error && error.message.includes("Camera access is not available")) {
    return error.message;
  }

  if (error && typeof error === "object" && "name" in error) {
    const errName = String(error.name);
    switch (errName) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission was denied. Please allow camera access in your browser and try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera device was detected on your system.";
      case "NotReadableError":
      case "TrackStartError":
        return "Camera is currently unavailable or in use by another application.";
      case "SecurityError":
        return "Camera access is restricted due to security settings or non-secure origin (HTTPS required).";
      case "OverconstrainedError":
        return "The requested camera resolution or constraints could not be satisfied.";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing the camera.";
}
