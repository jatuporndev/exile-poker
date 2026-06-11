import { get, onDisconnect, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "../../../shared/firebase/app";
import type { StoredPlayer } from "../../../shared/local/playerSession";
import { unoMaxPlayers } from "../domain/gameState";
import { unoColors } from "../domain/types";
import type {
  UnoCard,
  UnoColor,
  UnoGameState,
  UnoPlayer,
  UnoRoom,
} from "../domain/types";

type UnoRoomListener = (room: UnoRoom | null) => void;
type PresenceMap = Record<string, boolean>;

export async function createUnoRoom(owner: StoredPlayer): Promise<UnoRoom> {
  const id = await createUniqueUnoRoomCode();
  const host: UnoPlayer = {
    id: owner.id,
    name: owner.name,
    seat: 0,
    connected: true,
    isHost: true,
  };
  const room: UnoRoom = {
    id,
    hostId: owner.id,
    status: "lobby",
    createdAt: Date.now(),
    players: [host],
    game: null,
  };

  await set(unoRoomRef(id), room);
  await setUnoRoomPresence(id, owner.id, true);
  return room;
}

export async function joinUnoRoom(id: string, player: StoredPlayer): Promise<UnoRoom | null> {
  const roomId = normalizeUnoRoomCode(id);
  if (!roomId) {
    return null;
  }

  const existing = await get(unoRoomRef(roomId));
  if (!existing.exists()) {
    return null;
  }
  const presence = normalizePresenceMap((await get(unoRoomPresenceRef(roomId))).val());

  const result = await runTransaction(unoRoomRef(roomId), (value) => {
    const room = normalizeUnoRoom(value);
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

    // Drop disconnected lobby players to free seats; keep everyone once a game runs.
    if (room.status === "lobby") {
      room.players = room.players.filter(
        (candidate) => candidate.isSimulated || presence[candidate.id] !== false,
      );
    }

    if (room.players.length >= unoMaxPlayers) {
      return room;
    }

    room.players = [
      ...room.players,
      {
        id: player.id,
        name: player.name,
        seat: nextSeat(room.players),
        connected: true,
        isHost: room.hostId === player.id,
      },
    ];
    return room;
  });

  const room = normalizeUnoRoom(result.snapshot.val());
  if (room) {
    if (!room.players.some((candidate) => candidate.id === player.id)) {
      throw new Error("Room is full.");
    }
    await setUnoRoomPresence(room.id, player.id, true);
  }
  return room;
}

export async function saveUnoRoom(room: UnoRoom): Promise<void> {
  await set(unoRoomRef(room.id), room);
}

export async function addUnoSimulatedPlayer(room: UnoRoom): Promise<UnoRoom> {
  const index = room.players.filter((player) => player.isSimulated).length + 1;
  const updated: UnoRoom = {
    ...room,
    players: [
      ...room.players,
      {
        id: `sim-${crypto.randomUUID()}`,
        name: `Guest ${index}`,
        seat: nextSeat(room.players),
        connected: true,
        isSimulated: true,
      },
    ],
  };
  await saveUnoRoom(updated);
  return updated;
}

export function subscribeToUnoRoom(id: string, listener: UnoRoomListener): () => void {
  let latestRoom: UnoRoom | null = null;
  let latestPresence: PresenceMap = {};

  const emit = () => {
    listener(applyPresenceToRoom(latestRoom, latestPresence));
  };

  const unsubscribeRoom = onValue(unoRoomRef(id), (snapshot) => {
    latestRoom = normalizeUnoRoom(snapshot.val());
    emit();
  });

  const unsubscribePresence = onValue(unoRoomPresenceRef(id), (snapshot) => {
    latestPresence = normalizePresenceMap(snapshot.val());
    emit();
  });

  return () => {
    unsubscribeRoom();
    unsubscribePresence();
  };
}

export function trackUnoRoomPresence(id: string, playerId: string): () => void {
  return onValue(ref(firebaseDatabase, ".info/connected"), async (snapshot) => {
    if (snapshot.val() !== true) {
      return;
    }

    const presenceRef = unoRoomPresenceRef(id, playerId);
    await onDisconnect(presenceRef).set(false);
    await set(presenceRef, true);
  });
}

export async function leaveUnoRoom(id: string, playerId: string): Promise<void> {
  await setUnoRoomPresence(id, playerId, false);
}

export async function unoRoomExists(code: string): Promise<boolean> {
  const roomId = normalizeUnoRoomCode(code);
  if (!roomId) {
    return false;
  }
  return (await get(unoRoomRef(roomId))).exists();
}

export function normalizeUnoRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function unoRoomRef(id: string) {
  return ref(firebaseDatabase, `unoRooms/${normalizeUnoRoomCode(id)}`);
}

function unoRoomPresenceRef(roomId: string, playerId?: string) {
  const basePath = `unoRoomPresence/${normalizeUnoRoomCode(roomId)}`;
  return ref(firebaseDatabase, playerId ? `${basePath}/${playerId}` : basePath);
}

async function createUniqueUnoRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRoomCode();
    // Codes must be unique across every game so a join code resolves to one room.
    const [unoSnapshot, pokerSnapshot] = await Promise.all([
      get(unoRoomRef(code)),
      get(ref(firebaseDatabase, `rooms/${code}`)),
    ]);
    if (!unoSnapshot.exists() && !pokerSnapshot.exists()) {
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

function nextSeat(players: UnoPlayer[]): number {
  const occupied = new Set(players.map((player) => player.seat));
  for (let seat = 0; seat < unoMaxPlayers; seat += 1) {
    if (!occupied.has(seat)) {
      return seat;
    }
  }
  return players.length;
}

function normalizeUnoRoom(value: unknown): UnoRoom | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const room = value as UnoRoom & {
    players?: UnoPlayer[] | Record<string, UnoPlayer>;
  };
  const players = normalizeList(room.players).filter(isUnoPlayer);

  return {
    ...room,
    id: room.id.toUpperCase(),
    players: players.sort((left, right) => left.seat - right.seat),
    game: normalizeUnoGame(room.game),
  };
}

function applyPresenceToRoom(room: UnoRoom | null, presence: PresenceMap): UnoRoom | null {
  if (!room) {
    return null;
  }

  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      connected: player.isSimulated ? true : presence[player.id] ?? player.connected,
    })),
  };
}

function normalizeUnoGame(value: unknown): UnoGameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const game = value as UnoGameState & {
    drawPile?: UnoCard[] | Record<string, UnoCard>;
    discardPile?: UnoCard[] | Record<string, UnoCard>;
    hands?: Record<string, UnoCard[] | Record<string, UnoCard>>;
  };

  return {
    ...game,
    activeColor: isUnoColor(game.activeColor) ? game.activeColor : "red",
    drawPile: normalizeList(game.drawPile).filter(isUnoCard),
    discardPile: normalizeList(game.discardPile).filter(isUnoCard),
    hands: normalizeHands(game.hands),
    pendingDraw: typeof game.pendingDraw === "number" ? game.pendingDraw : 0,
    drawnCardId: typeof game.drawnCardId === "string" ? game.drawnCardId : null,
    turnPlayerId: typeof game.turnPlayerId === "string" ? game.turnPlayerId : null,
    winnerId: typeof game.winnerId === "string" ? game.winnerId : null,
  };
}

function normalizeHands(value: unknown): Record<string, UnoCard[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, UnoCard[] | Record<string, UnoCard>>).map(
      ([playerId, hand]) => [playerId, normalizeList(hand).filter(isUnoCard)],
    ),
  );
}

function normalizeList<T>(value: T[] | Record<string, T> | null | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : Object.values(value).filter(Boolean);
}

function normalizePresenceMap(value: unknown): PresenceMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function isUnoCard(value: unknown): value is UnoCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<UnoCard>;
  return (
    typeof card.id === "string" &&
    typeof card.color === "string" &&
    typeof card.value === "string"
  );
}

function isUnoColor(value: unknown): value is UnoColor {
  return typeof value === "string" && (unoColors as readonly string[]).includes(value);
}

function isUnoPlayer(value: unknown): value is UnoPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const player = value as Partial<UnoPlayer>;
  return (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    typeof player.seat === "number" &&
    typeof player.connected === "boolean"
  );
}

async function setUnoRoomPresence(roomId: string, playerId: string, connected: boolean): Promise<void> {
  await set(unoRoomPresenceRef(roomId, playerId), connected);
}
