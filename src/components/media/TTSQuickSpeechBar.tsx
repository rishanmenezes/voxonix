import { useState, useRef, useEffect, type FormEvent } from "react";
import { Send, Volume2, X, Sparkles } from "lucide-react";

interface TTSQuickSpeechBarProps {
  onSpeak: (text: string) => boolean;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const QUICK_PHRASES = [
  "Hello everyone!",
  "Yes, I agree.",
  "No, please give me a moment.",
  "Thank you!",
  "Could you repeat that?",
  "I will type my response.",
];

export function TTSQuickSpeechBar({
  onSpeak,
  isOpen,
  onClose,
  className = "",
}: TTSQuickSpeechBarProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const sent = onSpeak(text);
    if (sent) {
      setText("");
    }
  };

  const handleSelectQuickPhrase = (phrase: string) => {
    onSpeak(phrase);
  };

  return (
    <div
      className={`relative z-30 mx-auto w-full max-w-xl px-3 animate-in fade-in slide-in-from-bottom-3 duration-200 ${className}`}
      role="region"
      aria-label="Type to Speak Interface"
    >
      <div className="rounded-2xl border border-noir/15 bg-card/95 p-3 shadow-2xl backdrop-blur-xl space-y-2.5">
        {/* Header & Close */}
        <div className="flex items-center justify-between border-b border-noir/10 pb-1.5 text-xs font-semibold text-noir">
          <span className="flex items-center gap-1.5 text-wine">
            <Volume2 className="h-4 w-4" />
            <span>Type to Speak (Speech Output)</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-noir/50 hover:bg-noir/10 hover:text-noir"
            aria-label="Close Type to Speak bar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick Response Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-semibold text-noir/50 shrink-0 flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5" /> Quick:
          </span>
          {QUICK_PHRASES.map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => handleSelectQuickPhrase(phrase)}
              className="shrink-0 rounded-full border border-noir/15 bg-background px-2.5 py-1 text-[11px] font-medium text-noir/80 hover:bg-noir/5 hover:border-wine hover:text-wine transition shadow-sm"
            >
              {phrase}
            </button>
          ))}
        </div>

        {/* Text Input Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message to speak to the call..."
            className="flex-1 rounded-xl border border-noir/15 bg-background px-3 py-2 text-xs text-noir placeholder:text-noir/40 focus:border-crimson focus:outline-none focus:ring-1 focus:ring-crimson"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-crimson px-3.5 py-2 text-xs font-semibold text-cream hover:bg-wine transition disabled:opacity-40 shadow-sm"
            aria-label="Speak message"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Speak</span>
          </button>
        </form>
      </div>
    </div>
  );
}
