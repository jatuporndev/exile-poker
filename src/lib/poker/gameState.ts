import { createDeck, drawCards, shuffleDeck } from "./deck";
import { pickWinningPlayerIds } from "./handEvaluator";
import type { GameState, Player } from "./types";

export function createInitialGame(players: Player[]): GameState {
  const seatedPlayers = players
    .filter((player) => player.chips > 0)
    .sort((left, right) => left.seat - right.seat);
  const dealerSeat = seatedPlayers[0]?.seat ?? 0;
  let deck = shuffleDeck(createDeck());
  const hands: GameState["hands"] = {};

  for (const player of seatedPlayers) {
    const draw = drawCards(deck, 2);
    hands[player.id] = {
      playerId: player.id,
      cards: draw.cards,
      folded: false,
      betThisRound: 0,
      committed: 0,
      acted: false,
    };
    deck = draw.deck;
  }

  const smallBlind = 10;
  const bigBlind = 20;
  const smallBlindPlayer = seatedPlayers[1 % seatedPlayers.length];
  const bigBlindPlayer = seatedPlayers[2 % seatedPlayers.length] ?? seatedPlayers[0];
  let pot = 0;

  if (smallBlindPlayer) {
    const posted = postBlind(hands[smallBlindPlayer.id], smallBlind);
    pot += posted;
  }

  if (bigBlindPlayer) {
    const posted = postBlind(hands[bigBlindPlayer.id], bigBlind);
    pot += posted;
  }

  const firstTurn = seatedPlayers[3 % seatedPlayers.length] ?? seatedPlayers[0] ?? null;

  return {
    dealerSeat,
    smallBlind,
    bigBlind,
    phase: "preflop",
    turnPlayerId: firstTurn?.id ?? null,
    pot,
    currentBet: bigBlind,
    minRaise: bigBlind,
    communityCards: [],
    deck,
    hands,
    winnerIds: [],
    message: "Preflop betting",
  };
}

export function activePlayerIds(game: GameState): string[] {
  return Object.values(game.hands)
    .filter((hand) => !hand.folded)
    .map((hand) => hand.playerId);
}

export function advancePhase(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  for (const hand of Object.values(next.hands)) {
    hand.betThisRound = 0;
    hand.acted = false;
  }
  next.currentBet = 0;
  next.minRaise = next.bigBlind;

  if (next.phase === "preflop") {
    const draw = drawCards(next.deck, 3);
    next.communityCards = draw.cards;
    next.deck = draw.deck;
    next.phase = "flop";
    next.message = "Flop betting";
  } else if (next.phase === "flop") {
    const draw = drawCards(next.deck, 1);
    next.communityCards = [...next.communityCards, ...draw.cards];
    next.deck = draw.deck;
    next.phase = "turn";
    next.message = "Turn betting";
  } else if (next.phase === "turn") {
    const draw = drawCards(next.deck, 1);
    next.communityCards = [...next.communityCards, ...draw.cards];
    next.deck = draw.deck;
    next.phase = "river";
    next.message = "River betting";
  } else {
    return finishShowdown(next);
  }

  next.turnPlayerId = firstActivePlayerId(next);
  return next;
}

export function finishShowdown(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  const contenders = Object.values(next.hands)
    .filter((hand) => !hand.folded)
    .map((hand) => ({
      playerId: hand.playerId,
      cards: [...hand.cards, ...next.communityCards],
    }));

  next.phase = "showdown";
  next.turnPlayerId = null;
  next.winnerIds = pickWinningPlayerIds(contenders);
  next.message = "Showdown";
  return next;
}

export function shouldAdvanceBettingRound(game: GameState): boolean {
  const activeHands = Object.values(game.hands).filter((hand) => !hand.folded);
  if (activeHands.length <= 1) {
    return true;
  }

  return activeHands.every(
    (hand) => hand.acted && hand.betThisRound === game.currentBet,
  );
}

export function firstActivePlayerId(game: GameState): string | null {
  return Object.values(game.hands).find((hand) => !hand.folded)?.playerId ?? null;
}

export function nextTurnPlayerId(game: GameState, currentPlayerId: string): string | null {
  const hands = Object.values(game.hands);
  const currentIndex = hands.findIndex((hand) => hand.playerId === currentPlayerId);
  if (currentIndex < 0) {
    return firstActivePlayerId(game);
  }

  for (let offset = 1; offset <= hands.length; offset += 1) {
    const candidate = hands[(currentIndex + offset) % hands.length];
    if (!candidate.folded) {
      return candidate.playerId;
    }
  }

  return null;
}

function postBlind(hand: GameState["hands"][string] | undefined, amount: number): number {
  if (!hand) {
    return 0;
  }
  hand.betThisRound = amount;
  hand.committed = amount;
  return amount;
}
