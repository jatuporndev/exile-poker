import type { Player, Room } from "../poker/types";

const playerKey = "exile-poker-player";
const roomsKey = "exile-poker-rooms";

type StoredPlayer = {
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

export function createLocalRoom(owner: StoredPlayer): Room {
  const rooms = readRooms();
  const id = createRoomCode();
  const host: Player = {
    id: owner.id,
    name: owner.name,
    seat: 0,
    chips: 1000,
    connected: true,
    isHost: true,
  };

  const room: Room = {
    id,
    hostId: owner.id,
    status: "lobby",
    createdAt: Date.now(),
    players: [host],
    game: null,
  };

  writeRooms({ ...rooms, [id]: room });
  return room;
}

export function readRoom(id: string): Room | null {
  return readRooms()[id.toUpperCase()] ?? null;
}

export function saveRoom(room: Room): void {
  const rooms = readRooms();
  writeRooms({ ...rooms, [room.id]: room });
}

export function joinLocalRoom(id: string, player: StoredPlayer): Room | null {
  const room = readRoom(id);
  if (!room) {
    return null;
  }

  if (!room.players.some((candidate) => candidate.id === player.id)) {
    room.players.push({
      id: player.id,
      name: player.name,
      seat: nextSeat(room.players),
      chips: 1000,
      connected: true,
      isHost: room.hostId === player.id,
    });
  }

  saveRoom(room);
  return room;
}

export function addSimulatedPlayer(room: Room): Room {
  const index = room.players.filter((player) => player.isSimulated).length + 1;
  const updated: Room = {
    ...room,
    players: [
      ...room.players,
      {
        id: `sim-${crypto.randomUUID()}`,
        name: `Guest ${index}`,
        seat: nextSeat(room.players),
        chips: 1000,
        connected: true,
        isSimulated: true,
      },
    ],
  };
  saveRoom(updated);
  return updated;
}

function readRooms(): Record<string, Room> {
  return readJson<Record<string, Room>>(roomsKey) ?? {};
}

function writeRooms(rooms: Record<string, Room>): void {
  localStorage.setItem(roomsKey, JSON.stringify(rooms));
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function nextSeat(players: Player[]): number {
  const occupied = new Set(players.map((player) => player.seat));
  for (let seat = 0; seat < 6; seat += 1) {
    if (!occupied.has(seat)) {
      return seat;
    }
  }
  return players.length;
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
