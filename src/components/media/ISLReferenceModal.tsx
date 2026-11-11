import { useState, useEffect, useMemo } from "react";
import { X, Search, BookOpen, AlertCircle, Sparkles, Layers } from "lucide-react";
import { ISL_VOCABULARY_ENTRIES, ISL_ALPHABET_ENTRIES } from "@/lib/vision/isl/isl-vocabulary";
import type { ISLSignCategory } from "@/lib/vision/isl/isl-types";

interface ISLReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function ISLReferenceModal({ isOpen, onClose, className = "" }: ISLReferenceModalProps) {
  const [activeTab, setActiveTab] = useState<"vocabulary" | "alphabet" | "linguistics">(
    "vocabulary",
  );
  const [selectedCategory, setSelectedCategory] = useState<ISLSignCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVocabulary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ISL_VOCABULARY_ENTRIES.filter((entry) => {
      if (selectedCategory !== "all" && entry.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        entry.englishGloss.toLowerCase().includes(q) ||
        (entry.hindiGloss && entry.hindiGloss.toLowerCase().includes(q)) ||
        entry.description.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const filteredAlphabet = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ISL_ALPHABET_ENTRIES.filter((entry) => {
      if (!q) return true;
      return (
        entry.englishGloss.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q)
      );
    });
  }, [searchQuery]);

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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-noir/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-150 ${className}`}
      role="dialog"
      aria-label="Indian Sign Language Reference Guide"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-3xl max-h-[90vh] rounded-3xl border border-noir/20 bg-card p-5 sm:p-6 shadow-2xl backdrop-blur-2xl space-y-4 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-noir/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-wine/10 text-wine">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-noir font-display">
                  Indian Sign Language (ISL) Visual Guide
                </h2>
                <span className="rounded-full bg-wine/10 px-2.5 py-0.5 text-[10px] font-bold text-wine border border-wine/20">
                  Two-Handed Tradition
                </span>
              </div>
              <p className="text-xs text-noir/60">
                Educational sign reference and two-handed fingerspelling system.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-noir/50 hover:bg-noir/10 hover:text-noir transition"
            aria-label="Close ISL reference guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Top Notice Banner */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Linguistic Scope & Disclosure:</span>
            <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              Indian Sign Language uses two-handed manual alphabets and spatial grammar distinct
              from ASL. Displaying sign reference images or isolated vocabulary is an educational
              aid; it does not replace fluent continuous human interpretation.
            </p>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 rounded-2xl bg-noir/5 p-1 border border-noir/10">
            <button
              type="button"
              onClick={() => setActiveTab("vocabulary")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "vocabulary"
                  ? "bg-card text-wine shadow-sm"
                  : "text-noir/70 hover:text-noir"
              }`}
            >
              ISL Vocabulary ({ISL_VOCABULARY_ENTRIES.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("alphabet")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "alphabet"
                  ? "bg-card text-wine shadow-sm"
                  : "text-noir/70 hover:text-noir"
              }`}
            >
              Two-Handed Alphabet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("linguistics")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "linguistics"
                  ? "bg-card text-wine shadow-sm"
                  : "text-noir/70 hover:text-noir"
              }`}
            >
              ASL vs ISL Differences
            </button>
          </div>

          <div className="relative flex items-center min-w-[200px]">
            <Search className="absolute left-3 h-3.5 w-3.5 text-noir/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search signs or Hindi gloss..."
              className="w-full rounded-xl border border-noir/15 bg-background pl-8 pr-7 py-1.5 text-xs text-noir focus:border-crimson focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 rounded-full p-0.5 text-noir/40 hover:text-noir"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Vocabulary Grid */}
        {activeTab === "vocabulary" && (
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[45vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredVocabulary.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-noir/15 bg-background p-3.5 shadow-sm space-y-2 hover:border-wine/50 transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-noir">{entry.englishGloss}</h3>
                      {entry.hindiGloss && (
                        <p className="text-xs text-wine font-medium">{entry.hindiGloss}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        entry.twoHanded
                          ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      }`}
                    >
                      {entry.twoHanded ? "Two-Handed" : "One-Handed"}
                    </span>
                  </div>

                  <p className="text-xs text-noir/80 leading-relaxed">{entry.description}</p>
                  <p className="text-[11px] text-noir/60 italic font-mono bg-noir/5 p-2 rounded-xl">
                    <span className="font-semibold text-noir/70">Movement:</span>{" "}
                    {entry.movementDescription}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Two-Handed Alphabet */}
        {activeTab === "alphabet" && (
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[45vh]">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-200">
              <strong>ISL Alphabet Rule:</strong> The dominant hand acts as the pointer / pen, while
              the non-dominant hand acts as the paper / base. Vowels (A, E, I, O, U) are formed by
              touching the tips of the 5 fingers from thumb to pinky.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAlphabet.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-noir/15 bg-background p-3.5 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-wine">{entry.englishGloss}</span>
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                      Two-Handed
                    </span>
                  </div>
                  <p className="text-xs text-noir/80 leading-relaxed">{entry.description}</p>
                  <p className="text-[11px] text-noir/60 italic font-mono bg-noir/5 p-2 rounded-xl">
                    <span className="font-semibold text-noir/70">Mnemonic:</span> {entry.mnemonic}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Linguistic Analysis */}
        {activeTab === "linguistics" && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-3.5 text-xs text-noir/80 leading-relaxed max-h-[45vh]">
            <div className="rounded-2xl border border-noir/10 bg-background p-4 space-y-2">
              <h3 className="font-bold text-sm text-noir flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-wine" />
                <span>1. American Sign Language (ASL) vs Indian Sign Language (ISL)</span>
              </h3>
              <p>
                ASL and ISL belong to completely distinct sign language families. ASL belongs to the
                French Sign Language family and utilizes a single-handed fingerspelling alphabet.
                ISL has roots in the BANZSL (British, Australian, New Zealand) family and uses a
                two-handed manual alphabet with distinct syntactic and grammatical morphology.
              </p>
              <p className="text-crimson font-medium">
                Datasets, models, or recognition pipelines trained for ASL must not be conflated
                with or substituted for ISL.
              </p>
            </div>

            <div className="rounded-2xl border border-noir/10 bg-background p-4 space-y-2">
              <h3 className="font-bold text-sm text-noir flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-wine" />
                <span>2. The Limits of Static Sign Recognition</span>
              </h3>
              <p>
                Natural sign language is multi-channel: meaning is conveyed through handshape,
                orientation, movement trajectory, location in front of the body, and non-manual
                markers (facial expression, mouth morphemes, head tilts, and shoulder posture).
              </p>
              <p>
                Static 2D image recognition or single-frame alphabet classification cannot translate
                natural sign language grammar. VOXONIX maintains an honest, experimental boundary:
                we provide fingerspelling assistance and temporal word classification while avoiding
                unsupported claims of fluent sign language translation.
              </p>
            </div>
          </div>
        )}

        {/* Bottom Close Bar */}
        <div className="flex items-center justify-between border-t border-noir/10 pt-3">
          <span className="text-[11px] text-noir/50">
            VOXONIX Inclusive Communication • Visual Indian Sign Language Reference
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-wine px-4 py-1.5 text-xs font-bold text-cream hover:bg-wine/90 transition shadow-sm"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
