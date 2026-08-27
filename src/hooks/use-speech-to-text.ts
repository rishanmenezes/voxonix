import { useEffect, useRef, useState, useCallback } from "react";
import { STTFallbackStateMachine, type STTSystemState } from "@/lib/stt/stt-fallback-state-machine";
import type { TranscriptResult, STTTelemetry } from "@/lib/stt/types";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";
import type { SignalingBroker } from "@/lib/webrtc/signaling";

declare global {
  interface Window {
    __VOXONIX_STT_TELEMETRY__?: STTTelemetry;
    __VOXONIX_STT_STATE__?: STTSystemState;
  }
}

interface UseSpeechToTextProps {
  isMicMuted: boolean;
  isAudioLive: boolean;
  speakerPeerId: string;
  speakerDisplayName: string;
  signaling?: SignalingBroker | null;
  getAudioTrack?: () => MediaStreamTrack | null;
  onCaptionGenerated?: (caption: CaptionPayload) => void;
  language?: string;
  isDucked?: boolean;
  isAcousticEcho?: (transcript: string) => boolean;
}

export function useSpeechToText({
  isMicMuted,
  isAudioLive,
  speakerPeerId,
  speakerDisplayName,
  signaling,
  getAudioTrack,
  onCaptionGenerated,
  language = "en-US",
  isDucked = false,
  isAcousticEcho,
}: UseSpeechToTextProps) {
  const stateMachineRef = useRef<STTFallbackStateMachine | null>(null);
  const [systemState, setSystemState] = useState<STTSystemState>("DISABLED");
  const [activeProviderName, setActiveProviderName] = useState<string>("Initializing...");
  const [latestLocalTranscript, setLatestLocalTranscript] = useState<TranscriptResult | null>(null);
  const [telemetry, setTelemetry] = useState<STTTelemetry | null>(null);

  // Keep mutable references fresh
  const propsRef = useRef({
    speakerPeerId,
    speakerDisplayName,
    onCaptionGenerated,
    language,
    isAcousticEcho,
  });

  useEffect(() => {
    propsRef.current = {
      speakerPeerId,
      speakerDisplayName,
      onCaptionGenerated,
      language,
      isAcousticEcho,
    };
  }, [speakerPeerId, speakerDisplayName, onCaptionGenerated, language, isAcousticEcho]);

  // Initialize state machine when signaling is ready
  useEffect(() => {
    if (!signaling) return;

    const sm = new STTFallbackStateMachine({
      signaling,
      getAudioTrack: getAudioTrack || (() => null),
      onTranscript: (result) => {
        const currentProps = propsRef.current;

        // Acoustic Echo Gate: Filter out speech transcribed from local speakers
        if (currentProps.isAcousticEcho && currentProps.isAcousticEcho(result.text)) {
          return;
        }

        setLatestLocalTranscript(result);

        if (currentProps.onCaptionGenerated) {
          const captionId = `c_${result.utteranceId}_${result.revision}`;
          currentProps.onCaptionGenerated({
            captionId,
            utteranceId: result.utteranceId,
            revision: result.revision,
            speakerPeerId: currentProps.speakerPeerId,
            speakerDisplayName: currentProps.speakerDisplayName,
            text: result.text,
            isFinal: result.isFinal,
            timestamp: Date.now(),
            clientSentAt: Date.now(),
            language: currentProps.language,
            localSTTTimings: result.timings
              ? {
                  speechDetectionMs: result.timings.speechDetectionLatencyMs,
                  firstInterimMs: result.timings.firstInterimLatencyMs,
                  finalResultMs: result.timings.finalResultLatencyMs,
                  totalRecognitionMs: result.timings.totalRecognitionLatencyMs,
                }
              : undefined,
          });
        }
      },
      onStateChange: (st) => {
        setSystemState(st);
        if (typeof window !== "undefined") {
          window.__VOXONIX_STT_STATE__ = st;
        }
      },
      onTelemetry: (tel) => {
        setTelemetry(tel);
        if (typeof window !== "undefined") {
          window.__VOXONIX_STT_TELEMETRY__ = tel;
        }
      },
      onError: (err) => {
        console.warn("[useSpeechToText] Recognition note:", err.message);
      },
    });

    stateMachineRef.current = sm;

    return () => {
      sm.destroy();
      stateMachineRef.current = null;
    };
  }, [signaling, getAudioTrack]);

  // Synchronize listening intent with microphone track state and software ducking
  useEffect(() => {
    const sm = stateMachineRef.current;
    if (!sm) return;

    // Gated by mic mute, audio live state, and software ducking during local TTS playback
    const shouldListen = !isMicMuted && isAudioLive && !isDucked;
    sm.setShouldListen(shouldListen, { language, continuous: true, interimResults: true }).catch(
      (err) => {
        console.warn("[useSpeechToText] setShouldListen error:", err);
      },
    );

    const activeProvider = sm.getActiveProvider();
    if (activeProvider) {
      setActiveProviderName(activeProvider.name);
    }
  }, [isMicMuted, isAudioLive, isDucked, language]);

  const simulateSpeech = useCallback((text: string, isFinal = true) => {
    const sm = stateMachineRef.current;
    const active = sm?.getActiveProvider();
    if (active && "emitTranscript" in active) {
      (active as { emitTranscript: (t: string, f: boolean) => void }).emitTranscript(text, isFinal);
    }
  }, []);

  return {
    systemState,
    activeProviderName,
    isSupported: true,
    latestLocalTranscript,
    telemetry,
    simulateSpeech,
  };
}
