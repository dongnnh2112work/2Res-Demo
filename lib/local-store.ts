import { randomUUID } from "crypto";
import { MAX_DISPLAY_WISHES, type EventPhase, type EventState, type Wish } from "@/lib/types";

export { isLocalDataMode } from "@/lib/data-mode";

const globalStore = globalThis as typeof globalThis & {
  __wishWallStore?: {
    wishes: Wish[];
    state: EventState;
  };
};

function store() {
  if (!globalStore.__wishWallStore) {
    globalStore.__wishWallStore = {
      wishes: [],
      state: {
        id: "main",
        phase: "collecting",
        updated_at: new Date().toISOString(),
      },
    };
  }
  return globalStore.__wishWallStore;
}

export function listWishes(): Wish[] {
  return store().wishes.slice(-MAX_DISPLAY_WISHES);
}

export function addWish(message: string, author: string | null): Wish {
  const wish: Wish = {
    id: randomUUID(),
    message,
    author,
    created_at: new Date().toISOString(),
  };
  store().wishes.push(wish);
  if (store().wishes.length > MAX_DISPLAY_WISHES * 2) {
    store().wishes = store().wishes.slice(-MAX_DISPLAY_WISHES);
  }
  return wish;
}

export function getEventState(): EventState {
  return store().state;
}

export function setEventPhase(phase: EventPhase): EventState {
  store().state = {
    id: "main",
    phase,
    updated_at: new Date().toISOString(),
  };
  return store().state;
}

export function clearWishes(): void {
  store().wishes = [];
}
