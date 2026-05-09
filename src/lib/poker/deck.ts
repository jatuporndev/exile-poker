import { ranks, suits } from "./cards";
import type { Card } from "./types";

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
}

export function shuffleDeck(deck: Card[], random = Math.random): Card[] {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function drawCards(deck: Card[], count: number): { cards: Card[]; deck: Card[] } {
  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count),
  };
}
