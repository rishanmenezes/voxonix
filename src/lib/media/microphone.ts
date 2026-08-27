export type MicrophoneState = "idle" | "requesting" | "live" | "stopped" | "error";

export interface MicrophoneDeviceInfo {
  label: string;
  readyState: MediaStreamTrackState | "unknown";
  enabled: boolean;
  muted: boolean;
}

export function isMediaDevicesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function")
  );
}

export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!isMediaDevicesSupported()) {
    throw new Error(
      "Microphone access is not available in this browser or context (requires HTTPS or localhost).",
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      stopMicrophoneStream(stream);
      throw new Error("No audio track found in the returned media stream.");
    }

    return stream;
  } catch (error) {
    throw new Error(mapMicrophoneError(error));
  }
}

export function stopMicrophoneStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

export function extractMicrophoneInfo(stream: MediaStream | null): MicrophoneDeviceInfo {
  if (!stream) {
    return {
      label: "None",
      readyState: "unknown",
      enabled: false,
      muted: false,
    };
  }

  const track = stream.getAudioTracks()[0];
  if (!track) {
    return {
      label: "No Track",
      readyState: "unknown",
      enabled: false,
      muted: false,
    };
  }

  return {
    label: track.label || "Default Microphone",
    readyState: track.readyState,
    enabled: track.enabled,
    muted: !track.enabled,
  };
}

export function mapMicrophoneError(error: unknown): string {
  if (error instanceof Error && error.message.includes("Microphone access is not available")) {
    return error.message;
  }

  if (error && typeof error === "object" && "name" in error) {
    const errName = String(error.name);
    switch (errName) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone permission was denied. Please allow microphone access in your browser and try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone device was detected on your system.";
      case "NotReadableError":
      case "TrackStartError":
        return "Microphone is currently unavailable or in use by another application.";
      case "SecurityError":
        return "Microphone access is restricted due to security settings or non-secure origin (HTTPS required).";
      case "OverconstrainedError":
        return "The requested microphone constraints could not be satisfied.";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing the microphone.";
}
