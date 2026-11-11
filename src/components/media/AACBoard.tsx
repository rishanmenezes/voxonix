import { useState, useRef, useEffect, useMemo, type FormEvent } from "react";
import {
  Send,
  Volume2,
  X,
  Search,
  Star,
  Plus,
  Trash2,
  Sparkles,
  LayoutGrid,
  Smile,
  MessageCircle,
  LifeBuoy,
  PhoneCall,
  Heart,
  User,
  VolumeX,
} from "lucide-react";
import { AACStore, AAC_CATEGORIES } from "@/lib/aac/aac-store";
import type { AACCategoryId, AACPhrase } from "@/lib/aac/types";
import { getSharedGnaniTtsProvider } from "@/lib/tts/gnani-tts-provider";

interface AACBoardProps {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => boolean;
  onSendTextOnly?: (text: string) => boolean;
  className?: string;
}

export function AACBoard({
  isOpen,
  onClose,
  onSpeak,
  onSendTextOnly,
  className = "",
}: AACBoardProps) {
  const store = useMemo(() => AACStore.getInstance(), []);

  const [activeCategory, setActiveCategory] = useState<AACCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [composedText, setComposedText] = useState("");
  const [phrases, setPhrases] = useState<AACPhrase[]>(() => store.getAllPhrases());
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customPhraseInput, setCustomPhraseInput] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);

  // Focus compose input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => composeRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Sync phrase list
  const refreshPhrases = () => {
    setPhrases(store.getAllPhrases());
  };

  const filteredPhrases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return phrases.filter((phrase) => {
      if (activeCategory === "favorites") {
        if (!phrase.isFavorite) return false;
      } else if (activeCategory === "custom") {
        if (!phrase.isCustom) return false;
      } else if (activeCategory !== "all") {
        if (phrase.category !== activeCategory) return false;
      }

      if (q) {
        return phrase.text.toLowerCase().includes(q);
      }
      return true;
    });
  }, [phrases, activeCategory, searchQuery]);

  if (!isOpen) return null;

  const handleSelectPhrase = (phraseText: string) => {
    setComposedText((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${phraseText}` : phraseText;
    });
    composeRef.current?.focus();
  };

  const handleSendAndSpeak = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = composedText.trim();
    if (!textToSend) return;
    const sent = onSpeak(textToSend);
    if (sent) {
      setComposedText("");
    }
  };

  const handleSpeakLocallyOnly = () => {
    const textToSpeak = composedText.trim();
    if (!textToSpeak) return;
    void getSharedGnaniTtsProvider()
      .speakText(textToSpeak)
      .catch((err) => {
        console.warn("[AACBoard] Gnani Timbre TTS unavailable:", err);
      });
  };

  const handleSendTextOnly = () => {
    const textToSend = composedText.trim();
    if (!textToSend) return;
    if (onSendTextOnly) {
      onSendTextOnly(textToSend);
      setComposedText("");
    } else {
      handleSendAndSpeak();
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    store.toggleFavorite(id);
    refreshPhrases();
  };

  const handleDeleteCustom = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    store.deleteCustomPhrase(id);
    refreshPhrases();
  };

  const handleSaveCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!customPhraseInput.trim()) return;
    store.addCustomPhrase(customPhraseInput);
    setCustomPhraseInput("");
    setIsAddingCustom(false);
    refreshPhrases();
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case "Star":
        return <Star className="h-3.5 w-3.5 text-amber-500" />;
      case "Smile":
        return <Smile className="h-3.5 w-3.5 text-emerald-500" />;
      case "MessageCircle":
        return <MessageCircle className="h-3.5 w-3.5 text-blue-500" />;
      case "LifeBuoy":
        return <LifeBuoy className="h-3.5 w-3.5 text-crimson" />;
      case "PhoneCall":
        return <PhoneCall className="h-3.5 w-3.5 text-violet-500" />;
      case "Heart":
        return <Heart className="h-3.5 w-3.5 text-rose-500" />;
      case "User":
        return <User className="h-3.5 w-3.5 text-amber-600" />;
      default:
        return <LayoutGrid className="h-3.5 w-3.5 text-noir/70" />;
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-noir/50 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150 ${className}`}
      role="dialog"
      aria-label="AAC Communication Board"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-2xl max-h-[85vh] sm:max-h-[80vh] rounded-3xl border border-noir/20 bg-card p-4 sm:p-5 shadow-2xl backdrop-blur-2xl space-y-3 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-noir/10 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-wine/10 text-wine">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-noir flex items-center gap-1.5">
                <span>AAC Communication Board</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                  Assistive AAC Engine
                </span>
              </h2>
              <p className="text-[11px] text-noir/60">
                Tap phrases to assemble and voice messages directly to the call.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-noir/60 hover:bg-noir/10 hover:text-noir transition"
            aria-label="Close AAC Board"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Search & Category Tabs */}
        <div className="space-y-2">
          {/* Search Bar */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-3.5 w-3.5 text-noir/40 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phrases (e.g. hello, help, repeat)..."
              className="w-full rounded-xl border border-noir/15 bg-background pl-9 pr-8 py-1.5 text-xs text-noir placeholder:text-noir/40 focus:border-crimson focus:outline-none focus:ring-1 focus:ring-crimson transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 rounded-full p-0.5 text-noir/40 hover:text-noir"
                aria-label="Clear search query"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category Tabs Ribbon */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
            role="tablist"
            aria-label="Phrase Categories"
          >
            {AAC_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition border ${
                    isActive
                      ? "bg-wine text-cream border-wine shadow-sm"
                      : "bg-background text-noir/70 border-noir/15 hover:bg-noir/5 hover:text-noir"
                  }`}
                >
                  {getCategoryIcon(cat.iconName)}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Phrase Cards Grid (Scrollable) */}
        <div
          className="flex-1 overflow-y-auto min-h-[140px] max-h-[300px] pr-1 grid grid-cols-2 sm:grid-cols-3 gap-2"
          role="grid"
          aria-label="Phrases Grid"
        >
          {filteredPhrases.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-noir/50">
              No matching phrases found. Type below to create a custom phrase.
            </div>
          ) : (
            filteredPhrases.map((phrase) => (
              <div
                key={phrase.id}
                role="gridcell"
                className="group relative flex flex-col justify-between rounded-2xl border border-noir/10 bg-background p-2.5 text-left shadow-sm hover:border-wine hover:shadow-md transition cursor-pointer"
                onClick={() => handleSelectPhrase(phrase.text)}
              >
                <span className="text-xs font-medium text-noir group-hover:text-wine line-clamp-3">
                  {phrase.text}
                </span>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-noir/5 text-[10px] text-noir/40">
                  <span className="capitalize">{phrase.category.replace("_", " ")}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, phrase.id)}
                      className="p-1 hover:text-amber-500 rounded"
                      title={phrase.isFavorite ? "Remove favorite" : "Add favorite"}
                    >
                      <Star
                        className={`h-3 w-3 ${
                          phrase.isFavorite ? "fill-amber-400 text-amber-500" : "text-noir/30"
                        }`}
                      />
                    </button>
                    {phrase.isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustom(e, phrase.id)}
                        className="p-1 hover:text-crimson rounded"
                        title="Delete custom phrase"
                      >
                        <Trash2 className="h-3 w-3 text-noir/30 hover:text-crimson" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Custom Phrase Form Toggle */}
        {isAddingCustom ? (
          <form
            onSubmit={handleSaveCustom}
            className="flex items-center gap-2 p-2 rounded-2xl bg-noir/5 border border-noir/10"
          >
            <input
              type="text"
              value={customPhraseInput}
              onChange={(e) => setCustomPhraseInput(e.target.value)}
              placeholder="Enter new custom phrase..."
              className="flex-1 rounded-xl border border-noir/15 bg-background px-3 py-1.5 text-xs text-noir focus:border-crimson focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="rounded-xl bg-wine px-3 py-1.5 text-xs font-bold text-cream hover:bg-wine/90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsAddingCustom(false)}
              className="rounded-xl px-2 py-1.5 text-xs text-noir/60 hover:text-noir"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingCustom(true)}
            className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-wine hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Custom Phrase</span>
          </button>
        )}

        {/* Bottom Composition Buffer & Direct Action Bar */}
        <div className="border-t border-noir/15 pt-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              ref={composeRef}
              type="text"
              value={composedText}
              onChange={(e) => setComposedText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendAndSpeak();
                if (e.key === "Escape") onClose();
              }}
              placeholder="Click phrase cards above or type a custom message..."
              className="flex-1 rounded-xl border border-noir/20 bg-background px-3 py-2 text-xs font-medium text-noir placeholder:text-noir/40 focus:border-crimson focus:outline-none focus:ring-1 focus:ring-crimson"
            />
            {composedText && (
              <button
                type="button"
                onClick={() => setComposedText("")}
                className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-noir/50 hover:bg-noir/10 hover:text-noir transition"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSpeakLocallyOnly}
                disabled={!composedText.trim()}
                className="inline-flex items-center gap-1 rounded-xl border border-noir/15 bg-background px-3 py-1.5 text-xs font-semibold text-noir/80 hover:bg-noir/5 disabled:opacity-40 transition"
                title="Preview voice locally on this device"
              >
                <Volume2 className="h-3.5 w-3.5 text-wine" />
                <span>Hear Preview</span>
              </button>

              {onSendTextOnly && (
                <button
                  type="button"
                  onClick={handleSendTextOnly}
                  disabled={!composedText.trim()}
                  className="inline-flex items-center gap-1 rounded-xl border border-noir/15 bg-background px-3 py-1.5 text-xs font-semibold text-noir/80 hover:bg-noir/5 disabled:opacity-40 transition"
                  title="Send message to transcript without voice synthesis"
                >
                  <VolumeX className="h-3.5 w-3.5 text-noir/50" />
                  <span>Send Silently</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleSendAndSpeak()}
              disabled={!composedText.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-crimson px-4 py-1.5 text-xs font-bold text-cream hover:bg-wine shadow-md disabled:opacity-40 transition"
              title="Broadcast message and voice into call"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Voice to Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
