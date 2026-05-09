import { ranks, suits } from "./cards";
import type { Card } from "./types";

export const standardDeckSize = suits.length * ranks.length;

export function createDeck(): Card[] {
  const deck = suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
  assertValidDeck(deck);
  return deck;
}

export function shuffleDeck(deck: Card[], random = Math.random): Card[] {
  assertValidDeck(deck);
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function drawCards(deck: Card[], count: number): { cards: Card[]; deck: Card[] } {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Card draw count must be a non-negative integer.");
  }

  if (count > deck.length) {
    throw new Error(`Cannot draw ${count} cards from a deck with ${deck.length} cards.`);
  }

  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

export function cardKey(card: Card): string {
  return `${card.rank}-of-${card.suit}`;
}

export function assertValidDeck(deck: Card[]): void {
  if (deck.length !== standardDeckSize) {
    throw new Error(`A standard poker deck must contain ${standardDeckSize} cards.`);
  }

  const uniqueCards = new Set(deck.map(cardKey));
  if (uniqueCards.size !== standardDeckSize) {
    throw new Error("A standard poker deck cannot contain duplicate cards.");
  }
}
