import type { AACCategory, AACPhrase, AACCategoryId } from "./types";

export const AAC_CATEGORIES: readonly AACCategory[] = [
  { id: "all", label: "All Phrases", iconName: "LayoutGrid" },
  { id: "favorites", label: "Favorites", iconName: "Star" },
  { id: "greetings", label: "Greetings", iconName: "Smile" },
  { id: "responses", label: "Responses", iconName: "MessageCircle" },
  { id: "needs", label: "Needs & Help", iconName: "LifeBuoy" },
  { id: "call_controls", label: "Call Controls", iconName: "PhoneCall" },
  { id: "feelings", label: "Feelings", iconName: "Heart" },
  { id: "custom", label: "My Phrases", iconName: "User" },
] as const;

export const DEFAULT_AAC_PHRASES: readonly AACPhrase[] = [
  // Greetings
  { id: "g1", text: "Hello everyone!", category: "greetings" },
  { id: "g2", text: "Good morning.", category: "greetings" },
  { id: "g3", text: "Good afternoon.", category: "greetings" },
  { id: "g4", text: "How are you doing today?", category: "greetings" },
  { id: "g5", text: "Nice to meet you.", category: "greetings" },
  { id: "g6", text: "Thank you so much!", category: "greetings", isFavorite: true },
  { id: "g7", text: "You are welcome.", category: "greetings" },
  { id: "g8", text: "Please.", category: "greetings" },
  { id: "g9", text: "Goodbye, have a great day!", category: "greetings" },

  // Responses
  { id: "r1", text: "Yes, exactly.", category: "responses", isFavorite: true },
  { id: "r2", text: "No, that's not quite right.", category: "responses", isFavorite: true },
  { id: "r3", text: "Maybe, let me think.", category: "responses" },
  { id: "r4", text: "I agree with that completely.", category: "responses" },
  { id: "r5", text: "I disagree respectfully.", category: "responses" },
  { id: "r6", text: "I understand.", category: "responses" },
  { id: "r7", text: "I don't understand, could you clarify?", category: "responses" },
  { id: "r8", text: "Could you please repeat that?", category: "responses", isFavorite: true },
  { id: "r9", text: "Please speak a bit slower.", category: "responses" },

  // Needs & Help
  { id: "n1", text: "I need help with this.", category: "needs", isFavorite: true },
  { id: "n2", text: "Give me a minute to reply.", category: "needs", isFavorite: true },
  { id: "n3", text: "I am typing my response now.", category: "needs" },
  { id: "n4", text: "Please wait a moment.", category: "needs" },
  { id: "n5", text: "I need to take a short break.", category: "needs" },
  { id: "n6", text: "I cannot hear you clearly.", category: "needs" },
  { id: "n7", text: "I cannot see you clearly.", category: "needs" },
  { id: "n8", text: "This is an emergency.", category: "needs" },

  // Call Controls
  { id: "c1", text: "Please unmute your microphone.", category: "call_controls" },
  { id: "c2", text: "Your audio is breaking up.", category: "call_controls" },
  { id: "c3", text: "Your video stream is frozen.", category: "call_controls" },
  { id: "c4", text: "Can you see my shared screen?", category: "call_controls" },
  { id: "c5", text: "I can hear and see you perfectly.", category: "call_controls" },
  { id: "c6", text: "I need to leave the call soon.", category: "call_controls" },

  // Feelings & Well-being
  { id: "f1", text: "I feel great today.", category: "feelings" },
  { id: "f2", text: "I feel a bit tired.", category: "feelings" },
  { id: "f3", text: "I am feeling confused.", category: "feelings" },
  { id: "f4", text: "I am happy with this progress.", category: "feelings" },
  { id: "f5", text: "I feel overwhelmed, please give me space.", category: "feelings" },
  { id: "f6", text: "I am okay.", category: "feelings" },
] as const;

const STORAGE_CUSTOM_KEY = "voxonix_aac_custom_phrases_v1";
const STORAGE_FAVORITES_KEY = "voxonix_aac_favorites_v1";

export class AACStore {
  private static instance: AACStore | null = null;
  private customPhrases: AACPhrase[] = [];
  private favoriteIds: Set<string> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): AACStore {
    if (!AACStore.instance) {
      AACStore.instance = new AACStore();
    }
    return AACStore.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) {
      this.favoriteIds = new Set(DEFAULT_AAC_PHRASES.filter((p) => p.isFavorite).map((p) => p.id));
      return;
    }

    try {
      const storedCustom = window.localStorage.getItem(STORAGE_CUSTOM_KEY);
      if (storedCustom) {
        this.customPhrases = JSON.parse(storedCustom);
      }

      const storedFavs = window.localStorage.getItem(STORAGE_FAVORITES_KEY);
      if (storedFavs) {
        const arr: string[] = JSON.parse(storedFavs);
        this.favoriteIds = new Set(arr);
      } else {
        this.favoriteIds = new Set(
          DEFAULT_AAC_PHRASES.filter((p) => p.isFavorite).map((p) => p.id),
        );
      }
    } catch {
      this.customPhrases = [];
      this.favoriteIds = new Set();
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(this.customPhrases));
      window.localStorage.setItem(
        STORAGE_FAVORITES_KEY,
        JSON.stringify(Array.from(this.favoriteIds)),
      );
    } catch {
      // Ignore quota errors in storage
    }
  }

  public getAllPhrases(): AACPhrase[] {
    const defaultMapped = DEFAULT_AAC_PHRASES.map((p) => ({
      ...p,
      isFavorite: this.favoriteIds.has(p.id),
    }));

    const customMapped = this.customPhrases.map((p) => ({
      ...p,
      isFavorite: this.favoriteIds.has(p.id),
    }));

    return [...defaultMapped, ...customMapped];
  }

  public addCustomPhrase(text: string, category: AACCategoryId = "custom"): AACPhrase {
    const trimmed = text.trim();
    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newPhrase: AACPhrase = {
      id,
      text: trimmed,
      category: category === "all" || category === "favorites" ? "custom" : category,
      isCustom: true,
      isFavorite: false,
    };

    this.customPhrases.unshift(newPhrase);
    this.saveToStorage();
    return newPhrase;
  }

  public deleteCustomPhrase(id: string): boolean {
    const prevLen = this.customPhrases.length;
    this.customPhrases = this.customPhrases.filter((p) => p.id !== id);
    this.favoriteIds.delete(id);
    this.saveToStorage();
    return this.customPhrases.length !== prevLen;
  }

  public toggleFavorite(id: string): boolean {
    if (this.favoriteIds.has(id)) {
      this.favoriteIds.delete(id);
    } else {
      this.favoriteIds.add(id);
    }
    this.saveToStorage();
    return this.favoriteIds.has(id);
  }

  public filterPhrases(category: AACCategoryId, query = ""): AACPhrase[] {
    const all = this.getAllPhrases();
    const q = query.trim().toLowerCase();

    return all.filter((phrase) => {
      // Category filter
      if (category === "favorites") {
        if (!phrase.isFavorite) return false;
      } else if (category === "custom") {
        if (!phrase.isCustom) return false;
      } else if (category !== "all") {
        if (phrase.category !== category) return false;
      }

      // Search query filter
      if (q) {
        return phrase.text.toLowerCase().includes(q);
      }

      return true;
    });
  }
}
