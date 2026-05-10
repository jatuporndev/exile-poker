const playerKey = "exile-poker-player";

export type StoredPlayer = {
  id: string;
  name: string;
};

export function getOrCreateLocalPlayer(): StoredPlayer {
  const existing = readJson<StoredPlayer>(playerKey);
  if (existing) {
    return existing;
  }

  const player: StoredPlayer = {
    id: `local-${createPlayerId()}`,
    name: `Player ${Math.floor(100 + Math.random() * 900)}`,
  };
  writeJson(playerKey, player);
  return player;
}

export function updateLocalPlayerName(name: string): StoredPlayer {
  const current = getOrCreateLocalPlayer();
  const updated = { ...current, name: name.trim() || current.name };
  writeJson(playerKey, updated);
  return updated;
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
