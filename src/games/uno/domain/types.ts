export const unoColors = ["red", "yellow", "green", "blue"] as const;

export type UnoColor = (typeof unoColors)[number];

export type UnoValue =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4";

export type UnoCard = {
  id: string;
  color: UnoColor | "wild";
  value: UnoValue;
};

export type UnoPlayer = {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost?: boolean;
  isSimulated?: boolean;
};

export type UnoDirection = 1 | -1;

export type UnoPhase = "playing" | "finished";

export type UnoAction =
  | { type: "play"; cardId: string; chosenColor?: UnoColor }
  | { type: "draw" };

export type UnoGameState = {
  phase: UnoPhase;
  direction: UnoDirection;
  turnPlayerId: string | null;
  activeColor: UnoColor;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  hands: Record<string, UnoCard[]>;
  /** Accumulated penalty cards from stacked draw cards. */
  pendingDraw: number;
  /** Playable card drawn this turn that must be played before anything else. */
  drawnCardId: string | null;
  winnerId: string | null;
  message: string;
};

export type UnoRoomStatus = "lobby" | "playing" | "finished";

export type UnoRoom = {
  id: string;
  hostId: string;
  status: UnoRoomStatus;
  createdAt: number;
  players: UnoPlayer[];
  game: UnoGameState | null;
};
