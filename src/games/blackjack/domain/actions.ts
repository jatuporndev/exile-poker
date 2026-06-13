import {
  allBetsPlaced,
  bettors,
  dealRound,
  drawCard,
  minBet,
  nextActivePlayerId,
  startNextRound,
} from "./gameState";
import {
  canDouble,
  dealerShouldHit,
  handTotal,
  isBlackjack,
  isBust,
} from "./rules";
import type { BlackjackAction, BlackjackGameState, BlackjackPlayer } from "./types";

export function applyBlackjackAction(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  playerId: string,
  action: BlackjackAction,
): BlackjackGameState {
  const next = structuredClone(game) as BlackjackGameState;
  const hand = next.hands[playerId];
  if (!hand) {
    throw new Error("You are not part of this game.");
  }

  switch (action.type) {
    case "bet":
      return applyBet(next, players, playerId, action.amount);
    case "hit":
      return applyHit(next, players, playerId);
    case "stand":
      return applyStand(next, players, playerId);
    case "double":
      return applyDouble(next, players, playerId);
    case "next":
      return applyNext(next, players);
    default:
      throw new Error("Unknown action.");
  }
}

function applyBet(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  playerId: string,
  amount: number,
): BlackjackGameState {
  if (game.phase !== "betting") {
    throw new Error("Bets are closed for this round.");
  }
  const hand = game.hands[playerId];
  if (hand.bet > 0) {
    throw new Error("You have already placed your bet.");
  }
  if (!Number.isInteger(amount) || amount < minBet) {
    throw new Error(`The minimum bet is ${minBet}.`);
  }
  if (amount > hand.bankroll) {
    throw new Error("You cannot bet more than your bankroll.");
  }

  hand.bet = amount;
  hand.bankroll -= amount;

  if (allBetsPlaced(game, players)) {
    const dealt = dealRound(game, players);
    // Everyone drew a natural — no one acts, so settle immediately.
    if (dealt.phase === "playing" && !dealt.turnPlayerId) {
      return resolveDealer(dealt, players);
    }
    return dealt;
  }

  game.message = "Waiting for the rest of the table to bet.";
  return game;
}

function applyHit(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  playerId: string,
): BlackjackGameState {
  requireTurn(game, playerId);
  const hand = game.hands[playerId];

  hand.cards.push(drawCard(game));
  if (isBust(hand.cards)) {
    hand.status = "bust";
    hand.outcome = "bust";
    return advanceTurn(game, players, playerId);
  }
  if (handTotal(hand.cards) === 21) {
    hand.status = "stand";
    return advanceTurn(game, players, playerId);
  }
  game.message = "Hit or stand?";
  return game;
}

function applyStand(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  playerId: string,
): BlackjackGameState {
  requireTurn(game, playerId);
  game.hands[playerId].status = "stand";
  return advanceTurn(game, players, playerId);
}

function applyDouble(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  playerId: string,
): BlackjackGameState {
  requireTurn(game, playerId);
  const hand = game.hands[playerId];
  if (!canDouble(hand)) {
    throw new Error("You can only double down on your first two cards.");
  }

  // Double the wager, take exactly one card, then the turn is over.
  hand.bankroll -= hand.bet;
  hand.bet *= 2;
  hand.hasDoubled = true;
  hand.cards.push(drawCard(game));
  hand.status = isBust(hand.cards) ? "bust" : "stand";
  if (hand.status === "bust") {
    hand.outcome = "bust";
  }
  return advanceTurn(game, players, playerId);
}

function applyNext(game: BlackjackGameState, players: BlackjackPlayer[]): BlackjackGameState {
  if (game.phase !== "payout") {
    throw new Error("The round is still in progress.");
  }
  return startNextRound(game, players);
}

/** Moves to the next player, or runs the dealer and settles when none remain. */
function advanceTurn(
  game: BlackjackGameState,
  players: BlackjackPlayer[],
  fromPlayerId: string,
): BlackjackGameState {
  const nextId = nextActivePlayerId(game, players, fromPlayerId);
  if (nextId) {
    game.turnPlayerId = nextId;
    game.message = "Next player to act.";
    return game;
  }

  game.turnPlayerId = null;
  return resolveDealer(game, players);
}

/** Reveals the dealer, draws to 17, settles every hand, and pays out. */
function resolveDealer(game: BlackjackGameState, players: BlackjackPlayer[]): BlackjackGameState {
  game.dealer.revealed = true;

  const anyoneStanding = bettors(game, players).some(
    (player) => game.hands[player.id].status === "stand" || game.hands[player.id].status === "blackjack",
  );

  // The dealer only draws if at least one player can still be beaten.
  if (anyoneStanding) {
    while (dealerShouldHit(game.dealer.cards)) {
      game.dealer.cards.push(drawCard(game));
    }
  }

  const dealerTotal = handTotal(game.dealer.cards);
  const dealerBust = dealerTotal > 21;
  const dealerBlackjack = isBlackjack(game.dealer.cards);

  for (const player of bettors(game, players)) {
    settleHand(game, player.id, dealerTotal, dealerBust, dealerBlackjack);
  }

  game.phase = "payout";
  game.message = dealerBust
    ? `Dealer busts at ${dealerTotal}.`
    : `Dealer stands on ${dealerTotal}.`;
  return game;
}

function settleHand(
  game: BlackjackGameState,
  playerId: string,
  dealerTotal: number,
  dealerBust: boolean,
  dealerBlackjack: boolean,
): void {
  const hand = game.hands[playerId];
  const playerTotal = handTotal(hand.cards);
  const playerBlackjack = hand.status === "blackjack";

  if (hand.status === "bust") {
    hand.outcome = "bust";
    return;
  }

  if (playerBlackjack) {
    if (dealerBlackjack) {
      hand.outcome = "push";
      hand.bankroll += hand.bet;
    } else {
      // Naturals pay 3:2.
      hand.outcome = "blackjack";
      hand.bankroll += hand.bet + Math.floor(hand.bet * 1.5);
    }
    return;
  }

  if (dealerBlackjack) {
    hand.outcome = "lose";
    return;
  }

  if (dealerBust || playerTotal > dealerTotal) {
    hand.outcome = "win";
    hand.bankroll += hand.bet * 2;
  } else if (playerTotal === dealerTotal) {
    hand.outcome = "push";
    hand.bankroll += hand.bet;
  } else {
    hand.outcome = "lose";
  }
}

function requireTurn(game: BlackjackGameState, playerId: string): void {
  if (game.phase !== "playing") {
    throw new Error("It is not time to play cards.");
  }
  if (game.turnPlayerId !== playerId) {
    throw new Error("It is not your turn.");
  }
}
