const playerKey = "exile-poker-player";

export type StoredPlayer = {
  id: string;
  name: string;
  /** True once the player has explicitly chosen/confirmed their own name. */
  named?: boolean;
};

export function getOrCreateLocalPlayer(): StoredPlayer {
  const existing = readJson<StoredPlayer>(playerKey);
  if (existing) {
    return existing;
  }

  const player: StoredPlayer = {
    id: `local-${createPlayerId()}`,
    name: suggestPlayerName(),
  };
  writeJson(playerKey, player);
  return player;
}

/** Whether the player has picked their own name (vs. the auto-generated one). */
export function hasNamedPlayer(): boolean {
  const existing = readJson<StoredPlayer>(playerKey);
  return Boolean(existing?.named && existing.name.trim());
}

export function updateLocalPlayerName(name: string): StoredPlayer {
  const current = getOrCreateLocalPlayer();
  const trimmed = name.trim();
  const updated: StoredPlayer = {
    ...current,
    name: trimmed || current.name,
    // Confirm the name only when the player actually typed something.
    named: current.named || Boolean(trimmed),
  };
  writeJson(playerKey, updated);
  return updated;
}

/** A fun, random placeholder name suggestion for first-time players. */
export function suggestPlayerName(): string {
  const adjectives = [
    "Lucky",
    "Wild",
    "Sneaky",
    "Royal",
    "Bluffing",
    "Golden",
    "Swift",
    "Mighty",
  ];
  const nouns = ["Ace", "Joker", "Shark", "Fox", "Dealer", "Bandit", "Tiger", "Wizard"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}

function readJson<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const value = storage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function createPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
