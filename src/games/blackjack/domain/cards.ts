import type { BlackjackCard, BlackjackRank, BlackjackSuit } from "./types";

const suitSymbols: Record<BlackjackSuit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const suitLabels: Record<BlackjackSuit, string> = {
  spades: "Spades",
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
};

const rankLabels: Partial<Record<BlackjackRank, string>> = {
  A: "Ace",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

export function blackjackSuitSymbol(suit: BlackjackSuit): string {
  return suitSymbols[suit];
}

export function isRedSuit(suit: BlackjackSuit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function blackjackRankLabel(rank: BlackjackRank): string {
  return rankLabels[rank] ?? rank;
}

export function blackjackCardLabel(card: BlackjackCard): string {
  return `${blackjackRankLabel(card.rank)} of ${suitLabels[card.suit]}`;
}
