export type EventPhase = "collecting" | "converging" | "revealed";

export type Wish = {
  id: string;
  message: string;
  author: string | null;
  created_at: string;
};

export type EventState = {
  id: string;
  phase: EventPhase;
  updated_at: string;
};

export const MAX_WISH_LENGTH = 160;
export const MAX_DISPLAY_WISHES = 100;
