import type { TTSProvider, TTSVoice, TTSConfig, TTSQueueItem, TTSState } from "./types";

/**
 * BrowserTTSProvider
 *
 * Encapsulates the Web Speech API (SpeechSynthesis) with cross-browser resilience:
 * - Async voice loading via onvoiceschanged
 * - Chrome GC keepalive fix for long utterances
 * - iOS / Safari audio gesture unlocking
 * - Configurable pitch, rate, volume, and voice selection
 */
export class BrowserTTSProvider implements TTSProvider {
  public readonly id = "browser-speech-synthesis";
  public readonly name = "Browser Speech Synthesis (Web Speech API)";

  private state: TTSState = "idle";
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private stateListeners = new Set<(state: TTSState) => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private cachedVoices: TTSVoice[] = [];
  private voicesLoaded = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.isSupported()) {
      this.initVoices();
    }
  }

  public isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    );
  }

  /**
   * Unlock Web Speech synthesis on user gesture (required on iOS/Safari/restricted Chrome policies).
   */
  public async unlock(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const synth = window.speechSynthesis;
      if (synth.paused) {
        synth.resume();
      }
      // Speak and immediately cancel a blank utterance to prime the audio pipeline
      const dummy = new SpeechSynthesisUtterance(" ");
      dummy.volume = 0.01;
      dummy.rate = 2.0;
      synth.speak(dummy);
      setTimeout(() => {
        try {
          synth.cancel();
        } catch {
          // ignore
        }
      }, 50);
      return true;
    } catch (err) {
      console.warn("[BrowserTTS] Unlock error:", err);
      return false;
    }
  }

  public getState(): TTSState {
    return this.state;
  }

  private setState(newState: TTSState) {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((cb) => {
      try {
        cb(newState);
      } catch (err) {
        console.warn("[BrowserTTS] State listener error:", err);
      }
    });
  }

  private initVoices(): void {
    if (!this.isSupported()) return;

    const synth = window.speechSynthesis;
    const loadVoices = () => {
      try {
        const rawVoices = synth.getVoices();
        if (rawVoices && rawVoices.length > 0) {
          this.cachedVoices = rawVoices.map((v, idx) => ({
            id: v.voiceURI || `${v.name}-${v.lang}-${idx}`,
            name: v.name,
            lang: v.lang,
            default: v.default,
            localService: v.localService,
          }));
          this.voicesLoaded = true;
        }
      } catch (err) {
        console.warn("[BrowserTTS] Error loading voices:", err);
      }
    };

    loadVoices();
    if (typeof synth.onvoiceschanged !== "undefined") {
      synth.onvoiceschanged = () => loadVoices();
    }
  }

  public async getVoices(): Promise<TTSVoice[]> {
    if (!this.isSupported()) return [];

    if (this.voicesLoaded && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const raw = synth.getVoices();
      if (raw && raw.length > 0) {
        this.cachedVoices = raw.map((v, idx) => ({
          id: v.voiceURI || `${v.name}-${v.lang}-${idx}`,
          name: v.name,
          lang: v.lang,
          default: v.default,
          localService: v.localService,
        }));
        this.voicesLoaded = true;
        resolve(this.cachedVoices);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(this.cachedVoices);
      }, 500);

      synth.onvoiceschanged = () => {
        clearTimeout(timeout);
        const updated = synth.getVoices();
        this.cachedVoices = updated.map((v, idx) => ({
          id: v.voiceURI || `${v.name}-${v.lang}-${idx}`,
          name: v.name,
          lang: v.lang,
          default: v.default,
          localService: v.localService,
        }));
        this.voicesLoaded = true;
        resolve(this.cachedVoices);
      };
    });
  }

  public async speak(item: TTSQueueItem, config: TTSConfig): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("SpeechSynthesis is not supported in this environment");
    }

    // Cancel any current utterance before starting new one
    this.cancel();

    return new Promise<void>((resolve, reject) => {
      try {
        const synth = window.speechSynthesis;

        // Ensure engine is resumed (Chromium bug where synth can get paused in background)
        if (synth.paused) {
          synth.resume();
        }

        const utterance = new SpeechSynthesisUtterance(item.text);
        this.activeUtterance = utterance;

        utterance.rate = Math.max(0.5, Math.min(2.0, config.rate || 1.0));
        utterance.pitch = Math.max(0.5, Math.min(1.5, config.pitch || 1.0));
        utterance.volume = Math.max(0.0, Math.min(1.0, config.volume ?? 1.0));

        if (config.language) {
          utterance.lang = config.language;
        }

        // Voice selection: Match by voiceId or closest language match
        const rawVoices = synth.getVoices();
        if (rawVoices.length > 0) {
          if (config.voiceId) {
            const matched = rawVoices.find(
              (v, idx) =>
                (v.voiceURI || `${v.name}-${v.lang}-${idx}`) === config.voiceId ||
                v.name === config.voiceId,
            );
            if (matched) {
              utterance.voice = matched;
            }
          }
          if (!utterance.voice && config.language) {
            const langPrefix = config.language.split("-")[0];
            const langMatched = rawVoices.find((v) =>
              v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()),
            );
            if (langMatched) {
              utterance.voice = langMatched;
            }
          }
        }

        utterance.onstart = () => {
          this.setState("speaking");
          // Chrome GC keepalive: periodically pause and resume to prevent premature GC cancellation
          this.startKeepalive();
        };

        utterance.onend = () => {
          this.stopKeepalive();
          this.activeUtterance = null;
          this.setState("idle");
          resolve();
        };

        utterance.onerror = (event) => {
          this.stopKeepalive();
          this.activeUtterance = null;
          this.setState("idle");
          // "canceled" or "interrupted" are normal during user navigation / skip
          if (event.error !== "canceled" && event.error !== "interrupted") {
            const error = new Error(`TTS synthesis error: ${event.error}`);
            this.errorListeners.forEach((cb) => cb(error));
            reject(error);
          } else {
            resolve();
          }
        };

        synth.speak(utterance);
      } catch (err) {
        this.stopKeepalive();
        this.activeUtterance = null;
        this.setState("error");
        const error = err instanceof Error ? err : new Error(String(err));
        this.errorListeners.forEach((cb) => cb(error));
        reject(error);
      }
    });
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    // In Chromium browsers, SpeechSynthesis can hang on utterances >15s unless poked
    this.keepaliveTimer = setInterval(() => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        if (!window.speechSynthesis.speaking) {
          this.stopKeepalive();
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }
    }, 10000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  public pause(): void {
    if (this.isSupported()) {
      window.speechSynthesis.pause();
      this.setState("paused");
    }
  }

  public resume(): void {
    if (this.isSupported()) {
      window.speechSynthesis.resume();
      this.setState("speaking");
    }
  }

  public cancel(): void {
    this.stopKeepalive();
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
    this.activeUtterance = null;
    this.setState("idle");
  }

  public onStateChange(cb: (state: TTSState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public onError(cb: (error: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
}
