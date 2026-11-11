import { useState, useEffect, useMemo } from "react";
import { Hand, X, Play, Pause, ChevronLeft, ChevronRight, Sparkles, BookOpen } from "lucide-react";
import { ASL_SIGN_DICTIONARY } from "@/lib/vision/sign-dictionary";

interface SignSlidesReferenceProps {
  isOpen: boolean;
  onClose: () => void;
  activeText?: string; // Latest incoming speech/text caption to visualize as sign slides
  className?: string;
}

export function SignSlidesReference({
  isOpen,
  onClose,
  activeText = "",
  className = "",
}: SignSlidesReferenceProps) {
  const [selectedLetter, setSelectedLetter] = useState<string>("A");
  const [isPlayingSlides, setIsPlayingSlides] = useState<boolean>(false);
  const [slideIndex, setSlideIndex] = useState<number>(0);
  const [customWord, setCustomWord] = useState<string>("");

  // Extract clean letters from incoming active caption or custom typed word
  const activeLetters = useMemo(() => {
    const source = (customWord || activeText || "HELLO").toUpperCase();
    return source.replace(/[^A-Z]/g, "").split("");
  }, [activeText, customWord]);

  // Slideshow auto-advance (inspired by SignSlides.py 1-second interval)
  useEffect(() => {
    if (!isPlayingSlides || activeLetters.length === 0) return;

    const timer = setInterval(() => {
      setSlideIndex((prev) => {
        const next = (prev + 1) % activeLetters.length;
        setSelectedLetter(activeLetters[next]);
        return next;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [isPlayingSlides, activeLetters]);

  // Sync selected letter when active text changes
  useEffect(() => {
    if (activeLetters.length > 0 && !isPlayingSlides) {
      setSlideIndex(0);
      setSelectedLetter(activeLetters[0]);
    }
  }, [activeLetters, isPlayingSlides]);

  // Accessibility: close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentGlyph = ASL_SIGN_DICTIONARY[selectedLetter] || ASL_SIGN_DICTIONARY["A"];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-noir/60 backdrop-blur-sm animate-in fade-in duration-200 ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="Visual Sign & Fingerspelling Reference"
    >
      <div className="w-full max-w-xl rounded-2xl border border-noir/15 bg-card/95 p-5 shadow-2xl backdrop-blur-xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-noir/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-wine text-cream shadow">
              <Hand className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-noir flex items-center gap-1.5">
                <span>Sign Slides — Visual Reference</span>
                <span className="text-[10px] bg-wine/10 text-wine font-mono px-1.5 py-0.5 rounded-full">
                  ASL Aid
                </span>
              </h2>
              <p className="text-[11px] text-noir/60">
                Visual fingerspelling and sign cues for spoken captions & words
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-noir/50 hover:bg-noir/10 hover:text-noir transition"
            aria-label="Close sign slides"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Input word / caption preview */}
        <div className="flex items-center gap-2 bg-background/80 rounded-xl border border-noir/10 px-3 py-2">
          <BookOpen className="h-4 w-4 text-wine shrink-0" />
          <input
            type="text"
            value={customWord}
            onChange={(e) => setCustomWord(e.target.value)}
            placeholder={
              activeText ? `Active: "${activeText}"` : "Type a word to view sign slides..."
            }
            className="flex-1 bg-transparent text-xs text-noir placeholder:text-noir/40 focus:outline-none"
          />
          {activeLetters.length > 1 && (
            <button
              type="button"
              onClick={() => setIsPlayingSlides(!isPlayingSlides)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                isPlayingSlides
                  ? "bg-amber-400/20 text-amber-700"
                  : "bg-crimson text-cream hover:bg-wine"
              }`}
            >
              {isPlayingSlides ? (
                <>
                  <Pause className="h-3 w-3" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  <span>Play Slides</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Active Letter Sequence Ribbon */}
        {activeLetters.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {activeLetters.map((letter, idx) => {
              const isSelected = idx === slideIndex && letter === selectedLetter;
              return (
                <button
                  key={`${letter}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSlideIndex(idx);
                    setSelectedLetter(letter);
                    setIsPlayingSlides(false);
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold transition shadow-sm ${
                    isSelected
                      ? "bg-crimson text-cream scale-105 shadow-md"
                      : "bg-background border border-noir/10 text-noir/80 hover:bg-noir/5"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}

        {/* Main Sign Display Card (Slide) */}
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-background/60 rounded-2xl border border-noir/15 p-4">
          {/* Big Letter Glyph Display */}
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border-2 border-wine/20 bg-wine/5 shadow-inner">
            <span className="font-mono text-6xl font-extrabold text-wine">
              {currentGlyph.letter}
            </span>
            {currentGlyph.category === "dynamic" && (
              <span className="absolute bottom-1 right-1 text-[9px] font-mono text-amber-600 bg-amber-400/20 px-1 py-0.2 rounded">
                Dynamic
              </span>
            )}
          </div>

          {/* Details & Physical Instructions */}
          <div className="flex-1 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-noir flex items-center gap-1.5">
                <span>Letter {currentGlyph.letter}</span>
                <span className="text-[10px] text-wine font-medium">
                  ({currentGlyph.handshapeSummary})
                </span>
              </span>
              <span className="text-[10px] font-mono text-noir/50">
                {slideIndex + 1} of {activeLetters.length || 1}
              </span>
            </div>

            <p className="text-xs text-noir/80 leading-relaxed bg-card/80 p-2.5 rounded-xl border border-noir/10">
              {currentGlyph.description}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const idx = activeLetters.indexOf(selectedLetter);
                  const prevIdx = idx > 0 ? idx - 1 : activeLetters.length - 1;
                  setSelectedLetter(activeLetters[prevIdx] || "A");
                  setSlideIndex(prevIdx);
                }}
                className="rounded-lg p-1 text-noir/60 hover:bg-noir/10 hover:text-noir transition"
                title="Previous letter"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = activeLetters.indexOf(selectedLetter);
                  const nextIdx = (idx + 1) % (activeLetters.length || 1);
                  setSelectedLetter(activeLetters[nextIdx] || "A");
                  setSlideIndex(nextIdx);
                }}
                className="rounded-lg p-1 text-noir/60 hover:bg-noir/10 hover:text-noir transition"
                title="Next letter"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Alphabet Quick Grid */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-noir/60">
            <span>A–Z Alphabet Grid</span>
            <span className="text-[10px] text-wine flex items-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Tap any letter to inspect
            </span>
          </div>
          <div className="grid grid-cols-9 sm:grid-cols-13 gap-1">
            {Object.keys(ASL_SIGN_DICTIONARY).map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => {
                  setSelectedLetter(letter);
                  setIsPlayingSlides(false);
                }}
                className={`flex h-7 items-center justify-center rounded-lg text-xs font-mono font-bold transition ${
                  selectedLetter === letter
                    ? "bg-wine text-cream shadow-sm"
                    : "bg-background border border-noir/10 text-noir/70 hover:bg-noir/5 hover:text-noir"
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
