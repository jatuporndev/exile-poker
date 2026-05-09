import { createDeck, drawCards, shuffleDeck } from "./deck";
import { pickWinningPlayerIds } from "./handEvaluator";
import type { GameState, Player, PlayerHand } from "./types";

export function createInitialGame(players: Player[], previousDealerSeat?: number): GameState {
  const seatedPlayers = getSeatedPlayers(players);
  if (seatedPlayers.length < 2) {
    throw new Error("At least two players need chips to start a hand.");
  }

  const dealerPlayer =
    previousDealerSeat === undefined
      ? seatedPlayers[0]
      : nextSeatedPlayerAfterSeat(seatedPlayers, previousDealerSeat);
  const dealerSeat = dealerPlayer?.seat ?? 0;
  const orderedPlayers = orderPlayersFromSeat(seatedPlayers, dealerSeat);
  let deck = shuffleDeck(createDeck());
  const hands: GameState["hands"] = {};

  for (const player of seatedPlayers) {
    const draw = drawCards(deck, 2);
    hands[player.id] = {
      playerId: player.id,
      cards: draw.cards,
      folded: false,
      allIn: false,
      betThisRound: 0,
      committed: 0,
      acted: false,
    };
    deck = draw.deck;
  }

  const smallBlind = 10;
  const bigBlind = 20;
  const smallBlindPlayer =
    orderedPlayers.length === 2 ? orderedPlayers[0] : orderedPlayers[1 % orderedPlayers.length];
  const bigBlindPlayer =
    orderedPlayers.length === 2 ? orderedPlayers[1] : orderedPlayers[2 % orderedPlayers.length];
  let pot = 0;

  if (smallBlindPlayer) {
    const posted = postBlind(smallBlindPlayer, hands[smallBlindPlayer.id], smallBlind);
    pot += posted;
  }

  if (bigBlindPlayer) {
    const posted = postBlind(bigBlindPlayer, hands[bigBlindPlayer.id], bigBlind);
    pot += posted;
  }

  const firstTurn =
    orderedPlayers.length === 2
      ? orderedPlayers[0] ?? null
      : orderedPlayers[3 % orderedPlayers.length] ?? orderedPlayers[0] ?? null;

  return {
    dealerSeat,
    smallBlind,
    bigBlind,
    smallBlindPlayerId: smallBlindPlayer?.id ?? null,
    bigBlindPlayerId: bigBlindPlayer?.id ?? null,
    phase: "preflop",
    turnPlayerId: firstTurn?.id ?? null,
    pot,
    currentBet: bigBlind,
    minRaise: bigBlind,
    communityCards: [],
    deck,
    hands,
    winnerIds: [],
    revealedPlayerIds: [],
    message: "Preflop betting",
  };
}

export function activePlayerIds(game: GameState): string[] {
  return Object.values(game.hands)
    .filter((hand) => !hand.folded)
    .map((hand) => hand.playerId);
}

export function advancePhase(game: GameState, players: Player[] = []): GameState {
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

  next.turnPlayerId = firstActivePlayerId(next, players);
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

export function shouldAdvanceBettingRound(game: GameState, players: Player[] = []): boolean {
  const activeHands = Object.values(game.hands).filter((hand) => !hand.folded);
  if (activeHands.length <= 1) {
    return true;
  }

  if (activeBettingHands(game, players).length === 0) {
    return true;
  }

  if (onlyOnePlayerCanStillBet(game, players)) {
    return areBetsSettled(game, players) || game.currentBet === 0;
  }

  return areBetsSettled(game, players);
}

export function activeBettingHands(game: GameState, players: Player[] = []): PlayerHand[] {
  return Object.values(game.hands).filter(
    (hand) => !hand.folded && canPlayerAct(players, hand.playerId),
  );
}

export function areBetsSettled(game: GameState, players: Player[] = []): boolean {
  return Object.values(game.hands)
    .filter((hand) => !hand.folded)
    .every(
      (hand) =>
        !canPlayerAct(players, hand.playerId) ||
        (hand.acted && hand.betThisRound === game.currentBet),
    );
}

export function onlyOnePlayerCanStillBet(game: GameState, players: Player[] = []): boolean {
  return activeBettingHands(game, players).length === 1;
}

export function firstActivePlayerId(game: GameState, players: Player[] = []): string | null {
  if (players.length > 0) {
    const orderedPlayers = orderPlayersAfterSeat(getSeatedPlayers(players), game.dealerSeat);
    const firstActivePlayer = orderedPlayers.find((player) => {
      const hand = game.hands[player.id];
      return hand && !hand.folded && canPlayerAct(players, player.id);
    });

    return firstActivePlayer?.id ?? null;
  }

  return (
    Object.values(game.hands).find(
      (hand) => !hand.folded && canPlayerAct(players, hand.playerId),
    )?.playerId ?? null
  );
}

export function nextTurnPlayerId(
  game: GameState,
  currentPlayerId: string,
  players: Player[] = [],
): string | null {
  const hands = Object.values(game.hands);
  const currentIndex = hands.findIndex((hand) => hand.playerId === currentPlayerId);
  if (currentIndex < 0) {
    return firstActivePlayerId(game, players);
  }

  for (let offset = 1; offset < hands.length; offset += 1) {
    const candidate = hands[(currentIndex + offset) % hands.length];
    if (!candidate.folded && canPlayerAct(players, candidate.playerId)) {
      return candidate.playerId;
    }
  }

  return null;
}

function canPlayerAct(players: Player[], playerId: string): boolean {
  if (players.length === 0) {
    return true;
  }

  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return false;
  }

  return player.connected && player.chips > 0;
}

function getSeatedPlayers(players: Player[]): Player[] {
  return players
    .filter((player) => player.connected && player.chips > 0)
    .sort((left, right) => left.seat - right.seat);
}

function nextSeatedPlayerAfterSeat(players: Player[], seat: number): Player | undefined {
  return players.find((player) => player.seat > seat) ?? players[0];
}

function orderPlayersFromSeat(players: Player[], dealerSeat: number): Player[] {
  const dealerIndex = players.findIndex((player) => player.seat === dealerSeat);
  if (dealerIndex <= 0) {
    return players;
  }

  return players.slice(dealerIndex).concat(players.slice(0, dealerIndex));
}

function orderPlayersAfterSeat(players: Player[], seat: number): Player[] {
  const nextIndex = players.findIndex((player) => player.seat > seat);
  if (nextIndex <= 0) {
    return players;
  }

  return players.slice(nextIndex).concat(players.slice(0, nextIndex));
}

function postBlind(
  player: Player,
  hand: GameState["hands"][string] | undefined,
  amount: number,
): number {
  if (!hand) {
    return 0;
  }
  const committed = Math.min(player.chips, amount);
  player.chips -= committed;
  hand.betThisRound += committed;
  hand.committed += committed;
  hand.allIn = player.chips === 0;
  return committed;
}
