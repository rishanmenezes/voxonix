export type AACCategoryId =
  | "all"
  | "favorites"
  | "greetings"
  | "responses"
  | "needs"
  | "call_controls"
  | "feelings"
  | "custom";

export interface AACCategory {
  id: AACCategoryId;
  label: string;
  iconName: string;
  description?: string;
}

export interface AACPhrase {
  id: string;
  text: string;
  category: AACCategoryId;
  isFavorite?: boolean;
  isCustom?: boolean;
  frequency?: number;
}
