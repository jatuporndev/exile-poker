import { get, onDisconnect, onValue, ref, runTransaction, set } from "firebase/database";
import { firebaseDatabase } from "../../../shared/firebase/app";
import type { StoredPlayer } from "../../../shared/local/playerSession";
import { blackjackMaxPlayers, createEmptyHand, startingBankroll } from "../domain/gameState";
import type {
  BlackjackCard,
  BlackjackDealer,
  BlackjackGameState,
  BlackjackHand,
  BlackjackPlayer,
  BlackjackRoom,
} from "../domain/types";

type BlackjackRoomListener = (room: BlackjackRoom | null) => void;
type PresenceMap = Record<string, boolean>;

export async function createBlackjackRoom(owner: StoredPlayer): Promise<BlackjackRoom> {
  const id = await createUniqueBlackjackRoomCode();
  const host: BlackjackPlayer = {
    id: owner.id,
    name: owner.name,
    seat: 0,
    connected: true,
    isHost: true,
  };
  const room: BlackjackRoom = {
    id,
    hostId: owner.id,
    status: "lobby",
    createdAt: Date.now(),
    players: [host],
    game: null,
  };

  await set(blackjackRoomRef(id), room);
  await setBlackjackRoomPresence(id, owner.id, true);
  return room;
}

export async function joinBlackjackRoom(
  id: string,
  player: StoredPlayer,
): Promise<BlackjackRoom | null> {
  const roomId = normalizeBlackjackRoomCode(id);
  if (!roomId) {
    return null;
  }

  const existing = await get(blackjackRoomRef(roomId));
  if (!existing.exists()) {
    return null;
  }
  const presence = normalizePresenceMap((await get(blackjackRoomPresenceRef(roomId))).val());

  const result = await runTransaction(blackjackRoomRef(roomId), (value) => {
    const room = normalizeBlackjackRoom(value);
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

    if (room.players.length >= blackjackMaxPlayers) {
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

  const room = normalizeBlackjackRoom(result.snapshot.val());
  if (room) {
    if (!room.players.some((candidate) => candidate.id === player.id)) {
      throw new Error("Room is full.");
    }
    await setBlackjackRoomPresence(room.id, player.id, true);
  }
  return room;
}

export async function saveBlackjackRoom(room: BlackjackRoom): Promise<void> {
  await set(blackjackRoomRef(room.id), room);
}

export async function addBlackjackSimulatedPlayer(room: BlackjackRoom): Promise<BlackjackRoom> {
  const index = room.players.filter((player) => player.isSimulated).length + 1;
  const updated: BlackjackRoom = {
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
  await saveBlackjackRoom(updated);
  return updated;
}

export function subscribeToBlackjackRoom(
  id: string,
  listener: BlackjackRoomListener,
): () => void {
  let latestRoom: BlackjackRoom | null = null;
  let latestPresence: PresenceMap = {};

  const emit = () => {
    listener(applyPresenceToRoom(latestRoom, latestPresence));
  };

  const unsubscribeRoom = onValue(blackjackRoomRef(id), (snapshot) => {
    latestRoom = normalizeBlackjackRoom(snapshot.val());
    emit();
  });

  const unsubscribePresence = onValue(blackjackRoomPresenceRef(id), (snapshot) => {
    latestPresence = normalizePresenceMap(snapshot.val());
    emit();
  });

  return () => {
    unsubscribeRoom();
    unsubscribePresence();
  };
}

export function trackBlackjackRoomPresence(id: string, playerId: string): () => void {
  return onValue(ref(firebaseDatabase, ".info/connected"), async (snapshot) => {
    if (snapshot.val() !== true) {
      return;
    }

    const presenceRef = blackjackRoomPresenceRef(id, playerId);
    await onDisconnect(presenceRef).set(false);
    await set(presenceRef, true);
  });
}

export async function leaveBlackjackRoom(id: string, playerId: string): Promise<void> {
  await setBlackjackRoomPresence(id, playerId, false);
}

export async function blackjackRoomExists(code: string): Promise<boolean> {
  const roomId = normalizeBlackjackRoomCode(code);
  if (!roomId) {
    return false;
  }
  return (await get(blackjackRoomRef(roomId))).exists();
}

export function normalizeBlackjackRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function blackjackRoomRef(id: string) {
  return ref(firebaseDatabase, `blackjackRooms/${normalizeBlackjackRoomCode(id)}`);
}

function blackjackRoomPresenceRef(roomId: string, playerId?: string) {
  const basePath = `blackjackRoomPresence/${normalizeBlackjackRoomCode(roomId)}`;
  return ref(firebaseDatabase, playerId ? `${basePath}/${playerId}` : basePath);
}

async function createUniqueBlackjackRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRoomCode();
    // Codes must be unique across every game so a join code resolves to one room.
    const [blackjackSnapshot, unoSnapshot, pokerSnapshot] = await Promise.all([
      get(blackjackRoomRef(code)),
      get(ref(firebaseDatabase, `unoRooms/${code}`)),
      get(ref(firebaseDatabase, `rooms/${code}`)),
    ]);
    if (!blackjackSnapshot.exists() && !unoSnapshot.exists() && !pokerSnapshot.exists()) {
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

function nextSeat(players: BlackjackPlayer[]): number {
  const occupied = new Set(players.map((player) => player.seat));
  for (let seat = 0; seat < blackjackMaxPlayers; seat += 1) {
    if (!occupied.has(seat)) {
      return seat;
    }
  }
  return players.length;
}

function normalizeBlackjackRoom(value: unknown): BlackjackRoom | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const room = value as BlackjackRoom & {
    players?: BlackjackPlayer[] | Record<string, BlackjackPlayer>;
  };
  const players = normalizeList(room.players).filter(isBlackjackPlayer);

  return {
    ...room,
    id: room.id.toUpperCase(),
    players: players.sort((left, right) => left.seat - right.seat),
    game: normalizeBlackjackGame(room.game),
  };
}

function applyPresenceToRoom(
  room: BlackjackRoom | null,
  presence: PresenceMap,
): BlackjackRoom | null {
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

function normalizeBlackjackGame(value: unknown): BlackjackGameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const game = value as BlackjackGameState & {
    shoe?: BlackjackCard[] | Record<string, BlackjackCard>;
    dealer?: Partial<BlackjackDealer> & { cards?: BlackjackCard[] | Record<string, BlackjackCard> };
    hands?: Record<string, unknown>;
  };

  return {
    ...game,
    phase: game.phase ?? "betting",
    shoe: normalizeList(game.shoe).filter(isBlackjackCard),
    dealer: {
      cards: normalizeList(game.dealer?.cards).filter(isBlackjackCard),
      revealed: Boolean(game.dealer?.revealed),
    },
    hands: normalizeHands(game.hands),
    turnPlayerId: typeof game.turnPlayerId === "string" ? game.turnPlayerId : null,
    round: typeof game.round === "number" ? game.round : 1,
    message: typeof game.message === "string" ? game.message : "",
    startedAt: typeof game.startedAt === "number" ? game.startedAt : Date.now(),
  };
}

function normalizeHands(value: unknown): Record<string, BlackjackHand> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([playerId, raw]) => [
      playerId,
      normalizeHand(raw),
    ]),
  );
}

function normalizeHand(value: unknown): BlackjackHand {
  const base = createEmptyHand(startingBankroll);
  if (!value || typeof value !== "object") {
    return base;
  }

  const hand = value as Partial<BlackjackHand> & {
    cards?: BlackjackCard[] | Record<string, BlackjackCard>;
  };

  return {
    bankroll: typeof hand.bankroll === "number" ? hand.bankroll : startingBankroll,
    bet: typeof hand.bet === "number" ? hand.bet : 0,
    cards: normalizeList(hand.cards).filter(isBlackjackCard),
    status: hand.status ?? "betting",
    hasDoubled: Boolean(hand.hasDoubled),
    outcome: hand.outcome ?? null,
  };
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

function isBlackjackCard(value: unknown): value is BlackjackCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<BlackjackCard>;
  return (
    typeof card.id === "string" &&
    typeof card.suit === "string" &&
    typeof card.rank === "string"
  );
}

function isBlackjackPlayer(value: unknown): value is BlackjackPlayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const player = value as Partial<BlackjackPlayer>;
  return (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    typeof player.seat === "number" &&
    typeof player.connected === "boolean"
  );
}

async function setBlackjackRoomPresence(
  roomId: string,
  playerId: string,
  connected: boolean,
): Promise<void> {
  await set(blackjackRoomPresenceRef(roomId, playerId), connected);
}
