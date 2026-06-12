import { createUnoDeck, drawUnoCards, shuffleUnoDeck } from "./deck";
import type { UnoCard, UnoColor, UnoGameState, UnoPlayer } from "./types";

export const unoHandSize = 7;
export const unoMaxPlayers = 5;

export function createInitialUnoGame(
  players: UnoPlayer[],
  random = Math.random,
): UnoGameState {
  const seatedPlayers = getSeatedPlayers(players);
  if (seatedPlayers.length < 2) {
    throw new Error("At least two players are needed to start a game.");
  }
  if (seatedPlayers.length > unoMaxPlayers) {
    throw new Error(`UNO supports up to ${unoMaxPlayers} players.`);
  }

  let drawPile = shuffleUnoDeck(createUnoDeck(), random);
  const hands: UnoGameState["hands"] = {};

  for (const player of seatedPlayers) {
    hands[player.id] = drawPile.slice(0, unoHandSize);
    drawPile = drawPile.slice(unoHandSize);
  }

  // Flip cards until a number card starts the discard pile, so the opening
  // card never carries an action or a color choice.
  const discardPile: UnoCard[] = [];
  let startCard = drawPile[0];
  drawPile = drawPile.slice(1);
  while (!isNumberCard(startCard)) {
    discardPile.push(startCard);
    startCard = drawPile[0];
    drawPile = drawPile.slice(1);
  }
  discardPile.push(startCard);

  const firstPlayer = seatedPlayers[0];

  return {
    phase: "playing",
    direction: 1,
    turnPlayerId: firstPlayer.id,
    activeColor: startCard.color as UnoColor,
    drawPile,
    discardPile,
    hands,
    pendingDraw: 0,
    drawnCardId: null,
    winnerId: null,
    message: `${firstPlayer.name} starts.`,
    startedAt: Date.now(),
  };
}

export function getSeatedPlayers(players: UnoPlayer[]): UnoPlayer[] {
  return players
    .filter((player) => player.connected || player.isSimulated)
    .sort((left, right) => left.seat - right.seat);
}

export function nextUnoTurnPlayerId(
  game: UnoGameState,
  players: UnoPlayer[],
  fromPlayerId: string,
  steps = 1,
): string | null {
  const order = getSeatedPlayers(players).filter((player) => game.hands[player.id]);
  const currentIndex = order.findIndex((player) => player.id === fromPlayerId);
  if (currentIndex < 0 || order.length === 0) {
    return order[0]?.id ?? null;
  }

  const offset = game.direction * steps;
  const nextIndex = ((currentIndex + offset) % order.length + order.length) % order.length;
  return order[nextIndex]?.id ?? null;
}

/** Draws penalty or regular cards for a player, recycling the discard pile as needed. */
export function giveCards(game: UnoGameState, playerId: string, count: number): UnoCard[] {
  const result = drawUnoCards(game.drawPile, game.discardPile, count);
  game.drawPile = result.drawPile;
  game.discardPile = result.discardPile;
  game.hands[playerId] = [...(game.hands[playerId] ?? []), ...result.cards];
  return result.cards;
}

function isNumberCard(card: UnoCard): boolean {
  return /^[0-9]$/.test(card.value);
}
