import type { CaptionPayload } from "@/lib/webrtc/signaling-protocol";

interface ConversationTranscriptProps {
  captions: CaptionPayload[];
  localPeerId: string;
  onClose: () => void;
}

const sourceLabel: Record<NonNullable<CaptionPayload["source"]>, string> = {
  speech: "Speech",
  sign: "Sign",
  typed: "Typed",
};

/** Active-call transcript; intentionally ephemeral and separate from chat history. */
export function ConversationTranscript({
  captions,
  localPeerId,
  onClose,
}: ConversationTranscriptProps) {
  const finalCaptions = captions.filter((caption) => caption.isFinal);

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Conversation transcript"
      className="absolute inset-x-3 top-3 bottom-3 z-40 flex flex-col rounded-2xl border border-noir/20 bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:left-auto sm:right-4 sm:w-[24rem]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-noir/10 pb-3">
        <div>
          <h2 className="font-display text-xl font-bold text-noir">Conversation</h2>
          <p className="text-xs text-noir/60">Messages from this active call</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-noir/15 px-3 py-1.5 text-xs font-semibold text-noir hover:bg-noir/5"
        >
          Close
        </button>
      </div>

      <ol className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {finalCaptions.length === 0 ? (
          <li className="rounded-xl bg-noir/5 p-3 text-sm text-noir/65">
            Finalized speech, typed messages, and supported signs will appear here.
          </li>
        ) : (
          finalCaptions.map((caption) => {
            const isLocal = caption.speakerPeerId === localPeerId;
            return (
              <li
                key={caption.captionId}
                className="rounded-xl border border-noir/10 bg-background/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-noir/60">
                  <strong className="text-noir">
                    {caption.speakerDisplayName}
                    {isLocal ? " (You)" : ""}
                  </strong>
                  {caption.source && (
                    <span className="rounded bg-noir/8 px-1.5 py-0.5">
                      {sourceLabel[caption.source]}
                    </span>
                  )}
                </div>
                <p className="mt-1 break-words text-sm leading-relaxed text-noir">{caption.text}</p>
              </li>
            );
          })
        )}
      </ol>
    </aside>
  );
}
