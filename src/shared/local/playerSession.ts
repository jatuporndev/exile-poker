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

  const player = {
    id: `local-${crypto.randomUUID()}`,
    name: `Player ${Math.floor(100 + Math.random() * 900)}`,
  };
  localStorage.setItem(playerKey, JSON.stringify(player));
  return player;
}

export function updateLocalPlayerName(name: string): StoredPlayer {
  const current = getOrCreateLocalPlayer();
  const updated = { ...current, name: name.trim() || current.name };
  localStorage.setItem(playerKey, JSON.stringify(updated));
  return updated;
}

function readJson<T>(key: string): T | null {
  const value = localStorage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}
