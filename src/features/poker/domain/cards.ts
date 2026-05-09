import type { Card, Rank, Suit } from "./types";

export const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const ranks: Rank[] = [
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
  "A",
];

export const rankValues: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function cardLabel(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    clubs: "\u2663",
    diamonds: "\u2666",
    hearts: "\u2665",
    spades: "\u2660",
  };

  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "diamonds" || suit === "hearts";
}
