import { useEffect, useRef, useState, useCallback } from "react";
import { SpeechOutputEngine } from "@/lib/tts/speech-output-engine";
import type { TTSTelemetry } from "@/lib/tts/types";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";
import { useTTS } from "@/hooks/use-tts";

declare global {
  interface Window {
    __VOXONIX_TTS_TELEMETRY__?: TTSTelemetry;
  }
}

interface UseSpeechOutputProps {
  localPeerId: string;
  localDisplayName?: string;
  captions: CaptionPayload[];
  broadcastCaption?: (caption: CaptionPayload) => void;
}

export function useSpeechOutput({
  localPeerId,
  localDisplayName = "Participant",
  captions,
  broadcastCaption,
}: UseSpeechOutputProps) {
  const { config } = useTTS();
  const engineRef = useRef<SpeechOutputEngine | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMicDucked, setIsMicDucked] = useState(false);
  const [telemetry, setTelemetry] = useState<TTSTelemetry | null>(null);

  // Initialize SpeechOutputEngine
  useEffect(() => {
    const engine = new SpeechOutputEngine({
      localPeerId,
      initialConfig: config,
      onSpeakingChange: (speaking) => {
        setIsSpeaking(speaking);
      },
      onDuckingChange: (ducked) => {
        setIsMicDucked(ducked);
      },
      onTelemetry: (tel) => {
        setTelemetry(tel);
        if (typeof window !== "undefined") {
          window.__VOXONIX_TTS_TELEMETRY__ = tel;
        }
      },
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPeerId]);

  // Sync config updates to the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig(config);
    }
  }, [config]);

  // Feed incoming room captions to the engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || captions.length === 0) return;

    // Get the most recent finalized caption
    const latest = captions[captions.length - 1];
    if (latest && latest.isFinal) {
      engine.ingestCaption(latest);
    }
  }, [captions]);

  // Type-to-speak: Broadcast as caption to room peers AND queue for local/remote synthesis with preemption
  const speakTypedText = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const utteranceId = `typed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const timestamp = Date.now();

      // 1. Broadcast as a finalized caption to all peers in the room
      if (broadcastCaption) {
        broadcastCaption({
          captionId: `c_${utteranceId}_1`,
          utteranceId,
          revision: 1,
          speakerPeerId: localPeerId,
          speakerDisplayName: localDisplayName,
          text: trimmed,
          isFinal: true,
          timestamp,
          clientSentAt: timestamp,
          language: config.language,
        });
      }

      // 2. Queue in local engine if TTS is enabled locally (triggers immediate preemption of caption backlog)
      if (engineRef.current && config.enabled) {
        engineRef.current.enqueueTypedSpeech(trimmed, localDisplayName, utteranceId);
      }

      return true;
    },
    [localPeerId, localDisplayName, broadcastCaption, config.language, config.enabled],
  );

  const cancelSpeech = useCallback(() => {
    engineRef.current?.cancelAll();
  }, []);

  const pauseSpeech = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resumeSpeech = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const unlockAudio = useCallback(async (): Promise<boolean> => {
    if (!engineRef.current) return false;
    return engineRef.current.unlock();
  }, []);

  const isAcousticEcho = useCallback((transcript: string): boolean => {
    if (!engineRef.current) return false;
    return engineRef.current.isAcousticEcho(transcript);
  }, []);

  return {
    isSpeaking,
    isMicDucked,
    telemetry,
    speakTypedText,
    cancelSpeech,
    pauseSpeech,
    resumeSpeech,
    unlockAudio,
    isAcousticEcho,
  };
}
