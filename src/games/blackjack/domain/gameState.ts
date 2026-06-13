import { createBlackjackShoe, freshShoeIfLow, shuffleBlackjackShoe } from "./deck";
import { isBlackjack } from "./rules";
import type {
  BlackjackCard,
  BlackjackGameState,
  BlackjackHand,
  BlackjackPlayer,
} from "./types";

export const blackjackMaxPlayers = 5;
export const startingBankroll = 1000;
export const minBet = 10;
export const blackjackHandSize = 2;

export function createInitialBlackjackGame(
  players: BlackjackPlayer[],
  random = Math.random,
): BlackjackGameState {
  const seatedPlayers = getSeatedPlayers(players);
  if (seatedPlayers.length < 1) {
    throw new Error("At least one player is needed to start a game.");
  }
  if (seatedPlayers.length > blackjackMaxPlayers) {
    throw new Error(`Blackjack supports up to ${blackjackMaxPlayers} players.`);
  }

  const hands: Record<string, BlackjackHand> = {};
  for (const player of seatedPlayers) {
    hands[player.id] = createEmptyHand(startingBankroll);
  }

  return {
    phase: "betting",
    shoe: shuffleBlackjackShoe(createBlackjackShoe(), random),
    dealer: { cards: [], revealed: false },
    hands,
    turnPlayerId: null,
    round: 1,
    message: "Place your bets.",
    startedAt: Date.now(),
  };
}

export function createEmptyHand(bankroll: number): BlackjackHand {
  return {
    bankroll,
    bet: 0,
    cards: [],
    status: "betting",
    hasDoubled: false,
    outcome: null,
  };
}

export function getSeatedPlayers(players: BlackjackPlayer[]): BlackjackPlayer[] {
  return players
    .filter((player) => player.connected || player.isSimulated)
    .sort((left, right) => left.seat - right.seat);
}

/** Players seated in this round (those holding a hand) who have placed a wager. */
export function bettors(game: BlackjackGameState, players: BlackjackPlayer[]): BlackjackPlayer[] {
  return getSeatedPlayers(players).filter((player) => {
    const hand = game.hands[player.id];
    return hand && hand.bet > 0;
  });
}

/** True once every seated player with chips to spare has committed a bet. */
export function allBetsPlaced(game: BlackjackGameState, players: BlackjackPlayer[]): boolean {
  const seated = getSeatedPlayers(players).filter((player) => game.hands[player.id]);
  if (seated.length === 0) {
    return false;
  }
  return seated.every((player) => game.hands[player.id].bet > 0);
}

/** Deals the opening cards and starts the player turns. Mutates and returns game. */
export function dealRound(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  random = Math.random,
): BlackjackGameState {
  game.shoe = freshShoeIfLow(game.shoe, random);
  const order = bettors(game, players);

  // Two rounds of dealing, players first, matching how a real table deals.
  for (let pass = 0; pass < blackjackHandSize; pass += 1) {
    for (const player of order) {
      game.hands[player.id].cards.push(drawCard(game));
    }
    game.dealer.cards.push(drawCard(game));
  }

  for (const player of order) {
    const hand = game.hands[player.id];
    hand.status = isBlackjack(hand.cards) ? "blackjack" : "playing";
  }

  game.phase = "playing";
  game.turnPlayerId = nextActivePlayerId(game, players, null);
  game.message = game.turnPlayerId
    ? "Cards are out — players to act."
    : "Everyone has blackjack!";
  return game;
}

/** Pulls one card from the shoe, reshuffling a fresh shoe if it ever empties. */
export function drawCard(game: BlackjackGameState, random = Math.random): BlackjackCard {
  if (game.shoe.length === 0) {
    game.shoe = shuffleBlackjackShoe(createBlackjackShoe(), random);
  }
  return game.shoe.shift() as BlackjackCard;
}

/**
 * Finds the next seat (in order) still waiting to act. Pass the current player
 * id to advance past them, or null to find the first actor.
 */
export function nextActivePlayerId(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  fromPlayerId: string | null,
): string | null {
  const order = bettors(game, players);
  const startIndex = fromPlayerId
    ? order.findIndex((player) => player.id === fromPlayerId) + 1
    : 0;

  for (let index = startIndex; index < order.length; index += 1) {
    if (game.hands[order[index].id].status === "playing") {
      return order[index].id;
    }
  }
  return null;
}

/** Resets every seated hand for a new round, carrying bankrolls forward. */
export function startNextRound(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  random = Math.random,
): BlackjackGameState {
  const seated = getSeatedPlayers(players);
  const hands: Record<string, BlackjackHand> = {};
  for (const player of seated) {
    const previous = game.hands[player.id];
    hands[player.id] = createEmptyHand(previous ? previous.bankroll : startingBankroll);
  }

  game.hands = hands;
  game.dealer = { cards: [], revealed: false };
  game.shoe = freshShoeIfLow(game.shoe, random);
  game.phase = "betting";
  game.turnPlayerId = null;
  game.round += 1;
  game.message = "Place your bets.";
  return game;
}
