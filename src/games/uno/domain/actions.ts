import { giveCards, nextUnoTurnPlayerId } from "./gameState";
import { canPlayCard, isWildCard, mustStack, playableCards } from "./rules";
import type { UnoAction, UnoCard, UnoColor, UnoGameState, UnoPlayer } from "./types";

export function applyUnoAction(
  game: UnoGameState,
  players: UnoPlayer[],
  playerId: string,
  action: UnoAction,
): UnoGameState {
  if (game.phase !== "playing") {
    throw new Error("The game is over.");
  }
  if (game.turnPlayerId !== playerId) {
    throw new Error("It is not your turn.");
  }

  const next = structuredClone(game) as UnoGameState;
  const hand = next.hands[playerId];
  if (!hand) {
    throw new Error("You are not part of this game.");
  }

  if (action.type === "play") {
    return applyPlay(next, players, playerId, action.cardId, action.chosenColor);
  }
  return applyDraw(next, players, playerId);
}

function applyPlay(
  game: UnoGameState,
  players: UnoPlayer[],
  playerId: string,
  cardId: string,
  chosenColor?: UnoColor,
): UnoGameState {
  const hand = game.hands[playerId];
  const card = hand.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new Error("That card is not in your hand.");
  }
  if (game.drawnCardId && game.drawnCardId !== cardId) {
    throw new Error("You must play the card you just drew.");
  }
  if (!canPlayCard(game, card)) {
    throw new Error(
      game.pendingDraw > 0
        ? "You must stack a matching draw card or take the penalty."
        : "That card does not match the color or value.",
    );
  }
  if (isWildCard(card.value) && !chosenColor) {
    throw new Error("Choose a color for the wild card.");
  }

  return placeCard(game, players, playerId, card, chosenColor);
}

/** Applies a validated card to the table: discard, color, effects, win, turn. */
function placeCard(
  game: UnoGameState,
  players: UnoPlayer[],
  playerId: string,
  card: UnoCard,
  chosenColor?: UnoColor,
): UnoGameState {
  const player = findPlayer(players, playerId);

  game.hands[playerId] = game.hands[playerId].filter((candidate) => candidate.id !== card.id);
  game.discardPile = [...game.discardPile, card];
  game.activeColor = isWildCard(card.value) ? chosenColor! : (card.color as UnoColor);
  game.drawnCardId = null;

  if (card.value === "draw2") {
    game.pendingDraw += 2;
  } else if (card.value === "wild4") {
    game.pendingDraw += 4;
  }

  if (game.hands[playerId].length === 0) {
    game.phase = "finished";
    game.winnerId = playerId;
    game.turnPlayerId = null;
    game.message = `${player.name} wins!`;
    return game;
  }

  let steps = 1;
  if (card.value === "skip") {
    steps = 2;
  } else if (card.value === "reverse") {
    game.direction = game.direction === 1 ? -1 : 1;
    // With two players a reverse acts like a skip: the same player goes again.
    if (countSeatedPlayers(game, players) === 2) {
      steps = 0;
    }
  }

  game.turnPlayerId = nextUnoTurnPlayerId(game, players, playerId, steps);
  game.message = describePlay(player.name, card, game);
  return game;
}

function applyDraw(game: UnoGameState, players: UnoPlayer[], playerId: string): UnoGameState {
  const player = findPlayer(players, playerId);
  const hand = game.hands[playerId];

  if (game.pendingDraw > 0) {
    if (mustStack(game, hand)) {
      throw new Error("You have a draw card — you must stack it.");
    }

    const taken = giveCards(game, playerId, game.pendingDraw);
    game.message = `${player.name} draws ${taken.length} penalty cards.`;
    game.pendingDraw = 0;
    game.drawnCardId = null;
    game.turnPlayerId = nextUnoTurnPlayerId(game, players, playerId, 1);
    return game;
  }

  if (game.drawnCardId) {
    throw new Error("You must play the card you just drew.");
  }
  if (playableCards(game, hand).length > 0) {
    throw new Error("You have a playable card — you must play it.");
  }

  // Each draw action takes exactly one card. A playable draw is only marked —
  // the player plays it themselves; an unplayable one lets them draw again.
  const taken = giveCards(game, playerId, 1);
  if (taken.length === 0) {
    game.message = `${player.name} cannot draw — every card is in play.`;
    game.turnPlayerId = nextUnoTurnPlayerId(game, players, playerId, 1);
    return game;
  }

  const drawnCard = taken[0];
  if (canPlayCard(game, drawnCard)) {
    game.drawnCardId = drawnCard.id;
    game.message = `${player.name} draws a card and must play it.`;
  } else {
    game.message = `${player.name} draws a card (${game.hands[playerId].length} in hand) — nothing playable yet.`;
  }
  return game;
}

function describePlay(playerName: string, card: UnoCard, game: UnoGameState): string {
  if (card.value === "draw2" || card.value === "wild4") {
    const label = card.value === "draw2" ? "+2" : "+4";
    return `${playerName} plays ${label}. Stack rises to +${game.pendingDraw}.`;
  }
  if (card.value === "wild") {
    return `${playerName} plays a wild and picks ${game.activeColor}.`;
  }
  if (card.value === "skip") {
    return `${playerName} plays a skip.`;
  }
  if (card.value === "reverse") {
    return `${playerName} reverses the direction.`;
  }
  return `${playerName} plays ${card.color} ${card.value}.`;
}

function findPlayer(players: UnoPlayer[], playerId: string): UnoPlayer {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error("Player not found in this room.");
  }
  return player;
}

function countSeatedPlayers(game: UnoGameState, players: UnoPlayer[]): number {
  return players.filter((player) => game.hands[player.id]).length;
}
