export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type Player = {
  id: string;
  name: string;
  seat: number;
  chips: number;
  connected: boolean;
  isHost?: boolean;
  isSimulated?: boolean;
};

export type HandPhase =
  | "lobby"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

export type PlayerHand = {
  playerId: string;
  cards: Card[];
  folded: boolean;
  allIn?: boolean;
  betThisRound: number;
  committed: number;
  acted: boolean;
};

export type PokerAction =
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; amount: number }
  | { type: "raise"; amount: number }
  | { type: "fold" };

export type GameState = {
  dealerSeat: number;
  smallBlind: number;
  bigBlind: number;
  smallBlindPlayerId: string | null;
  bigBlindPlayerId: string | null;
  phase: HandPhase;
  turnPlayerId: string | null;
  pot: number;
  currentBet: number;
  minRaise: number;
  communityCards: Card[];
  deck: Card[];
  hands: Record<string, PlayerHand>;
  winnerIds: string[];
  revealedPlayerIds: string[];
  message: string;
};

export type RoomStatus = "lobby" | "playing" | "showdown";

export type PlayerReaction = {
  id: string;
  playerId: string;
  emoji: string;
  createdAt: number;
};

export type Room = {
  id: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  players: Player[];
  game: GameState | null;
  reactions: PlayerReaction[];
};
