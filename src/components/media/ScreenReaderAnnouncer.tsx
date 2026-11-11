import { useEffect, useState, useRef } from "react";
import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

interface ScreenReaderAnnouncerProps {
  captions?: CaptionPayload[];
  activeAnnouncement?: string;
  isCallConnected?: boolean;
  peerDisplayName?: string;
}

export function ScreenReaderAnnouncer({
  captions = [],
  activeAnnouncement,
  isCallConnected,
  peerDisplayName,
}: ScreenReaderAnnouncerProps) {
  const [politeText, setPoliteText] = useState("");
  const [assertiveText, setAssertiveText] = useState("");
  const lastSpokenCaptionIdRef = useRef<string>("");
  const wasConnectedRef = useRef<boolean>(false);

  // Announce incoming final captions
  useEffect(() => {
    if (captions.length === 0) return;
    const latest = captions[captions.length - 1];
    if (latest.isFinal && latest.captionId !== lastSpokenCaptionIdRef.current) {
      lastSpokenCaptionIdRef.current = latest.captionId;
      const verb = latest.source === "sign" ? "signed" : "said";
      setPoliteText(`${latest.speakerDisplayName} ${verb}: ${latest.text}`);
    }
  }, [captions]);

  // Announce explicit alerts
  useEffect(() => {
    if (activeAnnouncement) {
      setAssertiveText(activeAnnouncement);
    }
  }, [activeAnnouncement]);

  // Announce call connection / disconnection state
  useEffect(() => {
    if (isCallConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      setAssertiveText(`Connected in call with ${peerDisplayName || "participant"}.`);
    } else if (!isCallConnected && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      setAssertiveText("Call disconnected.");
    }
  }, [isCallConnected, peerDisplayName]);

  return (
    <div className="sr-only" aria-atomic="true">
      {/* Polite live region for conversational speech & captions */}
      <div role="status" aria-live="polite">
        {politeText}
      </div>

      {/* Assertive live region for critical system & connection alerts */}
      <div role="alert" aria-live="assertive">
        {assertiveText}
      </div>
    </div>
  );
}
