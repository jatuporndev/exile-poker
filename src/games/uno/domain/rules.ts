import type { UnoCard, UnoColor, UnoGameState, UnoValue } from "./types";

export function topDiscard(game: UnoGameState): UnoCard | undefined {
  return game.discardPile[game.discardPile.length - 1];
}

export function isDrawCard(value: UnoValue): boolean {
  return value === "draw2" || value === "wild4";
}

export function isWildCard(value: UnoValue): boolean {
  return value === "wild" || value === "wild4";
}

/**
 * House stacking rule: while a draw penalty is pending, a +2 can be answered
 * with a +2 or a +4, but a +4 can only be answered with another +4.
 */
export function canStackOn(card: UnoCard, top: UnoCard): boolean {
  if (top.value === "draw2") {
    return card.value === "draw2" || card.value === "wild4";
  }
  if (top.value === "wild4") {
    return card.value === "wild4";
  }
  return false;
}

export function canPlayCard(game: UnoGameState, card: UnoCard): boolean {
  const top = topDiscard(game);
  if (!top) {
    return false;
  }

  if (game.pendingDraw > 0) {
    return canStackOn(card, top);
  }

  if (isWildCard(card.value)) {
    return true;
  }

  return card.color === game.activeColor || card.value === top.value;
}

export function playableCards(game: UnoGameState, hand: UnoCard[]): UnoCard[] {
  return hand.filter((card) => canPlayCard(game, card));
}

/** Players must keep stacking while they can; drawing is only allowed otherwise. */
export function mustStack(game: UnoGameState, hand: UnoCard[]): boolean {
  return game.pendingDraw > 0 && playableCards(game, hand).length > 0;
}

export function cardScore(hand: UnoCard[]): number {
  return hand.reduce((total, card) => {
    if (card.value === "wild" || card.value === "wild4") {
      return total + 50;
    }
    if (card.value === "skip" || card.value === "reverse" || card.value === "draw2") {
      return total + 20;
    }
    return total + Number(card.value);
  }, 0);
}

export function mostCommonColor(hand: UnoCard[]): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of hand) {
    if (card.color !== "wild") {
      counts[card.color] += 1;
    }
  }

  return (Object.entries(counts) as [UnoColor, number][]).reduce(
    (best, entry) => (entry[1] > best[1] ? entry : best),
  )[0];
}
