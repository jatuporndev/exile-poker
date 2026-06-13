export const blackjackSuits = ["spades", "hearts", "diamonds", "clubs"] as const;

export type BlackjackSuit = (typeof blackjackSuits)[number];

export const blackjackRanks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type BlackjackRank = (typeof blackjackRanks)[number];

export type BlackjackCard = {
  id: string;
  suit: BlackjackSuit;
  rank: BlackjackRank;
};

export type BlackjackPlayer = {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost?: boolean;
  isSimulated?: boolean;
};

/** betting: everyone places a wager. playing: players hit/stand. payout: results shown. */
export type BlackjackPhase = "betting" | "playing" | "payout";

/** A single seat's status within the current round. */
export type HandStatus = "betting" | "playing" | "stand" | "bust" | "blackjack";

export type HandOutcome = "blackjack" | "win" | "push" | "lose" | "bust" | null;

export type BlackjackHand = {
  /** Chips carried across rounds; bets are escrowed out of this at bet time. */
  bankroll: number;
  /** Wager committed to the current round (0 until placed). */
  bet: number;
  cards: BlackjackCard[];
  status: HandStatus;
  hasDoubled: boolean;
  outcome: HandOutcome;
};

export type BlackjackDealer = {
  cards: BlackjackCard[];
  /** Whether the hole card is face up (true once players finish acting). */
  revealed: boolean;
};

export type BlackjackAction =
  | { type: "bet"; amount: number }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "next" };

export type BlackjackGameState = {
  phase: BlackjackPhase;
  /** The undealt cards remaining in the shoe. */
  shoe: BlackjackCard[];
  dealer: BlackjackDealer;
  hands: Record<string, BlackjackHand>;
  turnPlayerId: string | null;
  round: number;
  message: string;
  /** Epoch ms when the game started, shared so every client shows the same timer. */
  startedAt: number;
};

export type BlackjackRoomStatus = "lobby" | "playing" | "finished";

export type BlackjackRoom = {
  id: string;
  hostId: string;
  status: BlackjackRoomStatus;
  createdAt: number;
  players: BlackjackPlayer[];
  game: BlackjackGameState | null;
};
