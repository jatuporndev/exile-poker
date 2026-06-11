import { unoColors } from "./types";
import type { UnoCard, UnoValue } from "./types";

export const unoDeckSize = 108;

const coloredValues: { value: UnoValue; copies: number }[] = [
  { value: "0", copies: 1 },
  { value: "1", copies: 2 },
  { value: "2", copies: 2 },
  { value: "3", copies: 2 },
  { value: "4", copies: 2 },
  { value: "5", copies: 2 },
  { value: "6", copies: 2 },
  { value: "7", copies: 2 },
  { value: "8", copies: 2 },
  { value: "9", copies: 2 },
  { value: "skip", copies: 2 },
  { value: "reverse", copies: 2 },
  { value: "draw2", copies: 2 },
];

export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];

  for (const color of unoColors) {
    for (const { value, copies } of coloredValues) {
      for (let copy = 0; copy < copies; copy += 1) {
        deck.push({ id: `${color}-${value}-${copy}`, color, value });
      }
    }
  }

  for (let copy = 0; copy < 4; copy += 1) {
    deck.push({ id: `wild-wild-${copy}`, color: "wild", value: "wild" });
    deck.push({ id: `wild-wild4-${copy}`, color: "wild", value: "wild4" });
  }

  if (deck.length !== unoDeckSize) {
    throw new Error(`An UNO deck must contain ${unoDeckSize} cards.`);
  }

  return deck;
}

export function shuffleUnoDeck(deck: UnoCard[], random = Math.random): UnoCard[] {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export type UnoDrawResult = {
  cards: UnoCard[];
  drawPile: UnoCard[];
  discardPile: UnoCard[];
};

/**
 * Draws cards, reshuffling the discard pile (except its top visible card)
 * back into the draw pile whenever the draw pile runs out. The piles can be
 * recycled indefinitely; if every recyclable card is already in hands, fewer
 * cards than requested are returned.
 */
export function drawUnoCards(
  drawPile: UnoCard[],
  discardPile: UnoCard[],
  count: number,
  random = Math.random,
): UnoDrawResult {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Card draw count must be a non-negative integer.");
  }

  const cards: UnoCard[] = [];
  let nextDrawPile = [...drawPile];
  let nextDiscardPile = [...discardPile];

  while (cards.length < count) {
    if (nextDrawPile.length === 0) {
      if (nextDiscardPile.length <= 1) {
        break;
      }
      const topCard = nextDiscardPile[nextDiscardPile.length - 1];
      nextDrawPile = shuffleUnoDeck(nextDiscardPile.slice(0, -1), random);
      nextDiscardPile = [topCard];
    }

    cards.push(nextDrawPile[0]);
    nextDrawPile = nextDrawPile.slice(1);
  }

  return { cards, drawPile: nextDrawPile, discardPile: nextDiscardPile };
}
