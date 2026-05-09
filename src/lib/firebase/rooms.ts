import { get, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "./app";
import type { StoredPlayer } from "../local/session";
import type { Card, GameState, Player, PlayerHand, Room } from "../poker/types";

type RoomListener = (room: Room | null) => void;

export async function createOnlineRoom(owner: StoredPlayer): Promise<Room> {
  const id = await createUniqueRoomCode();
  const host: Player = {
    id: owner.id,
    name: owner.name,
    seat: 0,
    chips: 1000,
    connected: true,
    isHost: true,
  };
  const now = Date.now();
  const room: Room = {
    id,
    hostId: owner.id,
    status: "lobby",
    createdAt: now,
    players: [host],
    game: null,
  };

  await set(roomRef(id), room);
  await set(playerRoomRef(owner.id, id), true);
  return room;
}

export async function joinOnlineRoom(id: string, player: StoredPlayer): Promise<Room | null> {
  const roomId = normalizeRoomCode(id);
  if (!roomId) {
    return null;
  }

  const existing = await get(roomRef(roomId));
  if (!existing.exists()) {
    return null;
  }

  const result = await runTransaction(roomRef(roomId), (value) => {
    const room = normalizeRoom(value);
    if (!room) {
      return undefined;
    }

    const existingPlayer = room.players.find((candidate) => candidate.id === player.id);
    if (existingPlayer) {
      room.players = room.players.map((candidate) =>
        candidate.id === player.id
          ? { ...candidate, name: player.name, connected: true }
          : candidate,
      );
      return room;
    }

    if (room.players.length >= 6) {
      return room;
    }

    room.players = [
      ...room.players,
      {
        id: player.id,
        name: player.name,
        seat: nextSeat(room.players),
        chips: 1000,
        connected: true,
        isHost: room.hostId === player.id,
      },
    ];
    return room;
  });

  const room = normalizeRoom(result.snapshot.val());
  if (room) {
    if (!room.players.some((candidate) => candidate.id === player.id)) {
      throw new Error("Room is full.");
    }
    await set(playerRoomRef(player.id, room.id), true);
  }
  return room;
}

export async function saveOnlineRoom(room: Room): Promise<void> {
  await set(roomRef(room.id), room);
}

export async function addOnlineSimulatedPlayer(room: Room): Promise<Room> {
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
  await saveOnlineRoom(updated);
  return updated;
}

export function subscribeToOnlineRoom(id: string, listener: RoomListener): () => void {
  return onValue(roomRef(id), (snapshot) => {
    listener(normalizeRoom(snapshot.val()));
  });
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roomRef(id: string) {
  return ref(firebaseDatabase, `rooms/${normalizeRoomCode(id)}`);
}

function playerRoomRef(playerId: string, roomId: string) {
  return ref(firebaseDatabase, `playerRooms/${playerId}/${normalizeRoomCode(roomId)}`);
}

async function createUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRoomCode();
    const snapshot = await get(roomRef(code));
    if (!snapshot.exists()) {
      return code;
    }
  }

  throw new Error("Could not create a unique room code.");
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

function normalizeRoom(value: unknown): Room | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const room = value as Room & { players?: Player[] | Record<string, Player> };
  const players: Player[] = Array.isArray(room.players)
    ? room.players.filter(isPlayer)
    : Object.values(room.players ?? {}).filter(isPlayer);

  return {
    ...room,
    id: room.id.toUpperCase(),
    players: players.sort((left, right) => left.seat - right.seat),
    game: normalizeGame(room.game),
  };
}

function normalizeGame(value: unknown): GameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const game = value as GameState & {
    communityCards?: Card[] | Record<string, Card>;
    deck?: Card[] | Record<string, Card>;
    hands?: Record<string, PlayerHand>;
    winnerIds?: string[] | Record<string, string>;
  };
  return {
    ...game,
    communityCards: normalizeList(game.communityCards).filter(isCard),
    deck: normalizeList(game.deck).filter(isCard),
    hands: normalizeHands(game.hands),
    winnerIds: normalizeList(game.winnerIds).filter((winnerId): winnerId is string => typeof winnerId === "string"),
  };
}

function normalizeHands(value: unknown): Record<string, PlayerHand> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, PlayerHand>).map(([playerId, hand]) => [
      playerId,
      {
        ...hand,
        cards: normalizeList(hand.cards).filter(isCard),
      },
    ]),
  );
}

function normalizeList<T>(value: T[] | Record<string, T> | null | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : Object.values(value).filter(Boolean);
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<Card>;
  return typeof card.rank === "string" && typeof card.suit === "string";
}

function isPlayer(value: unknown): value is Player {
  if (!value || typeof value !== "object") {
    return false;
  }

  const player = value as Partial<Player>;
  return (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    typeof player.seat === "number" &&
    typeof player.chips === "number" &&
    typeof player.connected === "boolean"
  );
}
