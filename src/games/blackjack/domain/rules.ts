import type { BlackjackCard, BlackjackHand } from "./types";

/** The base point value of a rank, treating aces as 11 before any reduction. */
export function rankValue(rank: BlackjackCard["rank"]): number {
  if (rank === "A") {
    return 11;
  }
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") {
    return 10;
  }
  return Number(rank);
}

export type HandTotal = {
  total: number;
  /** True when an ace is still counted as 11 (i.e. the total is "soft"). */
  soft: boolean;
};

export function handValue(cards: BlackjackCard[]): HandTotal {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += rankValue(card.rank);
    if (card.rank === "A") {
      aces += 1;
    }
  }

  // Demote aces from 11 to 1 while the hand would otherwise bust.
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return { total, soft: aces > 0 && total <= 21 };
}

export function handTotal(cards: BlackjackCard[]): number {
  return handValue(cards).total;
}

export function isBust(cards: BlackjackCard[]): boolean {
  return handValue(cards).total > 21;
}

/** A natural: exactly two cards totalling 21. */
export function isBlackjack(cards: BlackjackCard[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** House rule: the dealer draws until reaching a hard or soft 17. */
export function dealerShouldHit(cards: BlackjackCard[]): boolean {
  return handValue(cards).total < 17;
}

export function canDouble(hand: BlackjackHand): boolean {
  return (
    hand.status === "playing" &&
    hand.cards.length === 2 &&
    !hand.hasDoubled &&
    hand.bankroll >= hand.bet
  );
}
