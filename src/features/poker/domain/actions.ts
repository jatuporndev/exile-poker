import {
  activePlayerIds,
  advancePhase,
  finishShowdown,
  nextTurnPlayerId,
  shouldAdvanceBettingRound,
} from "./gameState";
import type { GameState, Player, PokerAction } from "./types";

export function getAvailableActions(game: GameState, playerId: string): string[] {
  const hand = game.hands[playerId];
  if (!hand || hand.folded || game.turnPlayerId !== playerId || game.phase === "showdown") {
    return [];
  }

  const toCall = game.currentBet - hand.betThisRound;
  return toCall > 0 ? ["call", "raise", "fold"] : ["check", "bet", "fold"];
}

export function applyPokerAction(
  game: GameState,
  players: Player[],
  playerId: string,
  action: PokerAction,
): { game: GameState; players: Player[] } {
  if (game.turnPlayerId !== playerId) {
    throw new Error("It is not this player's turn.");
  }

  const nextGame = structuredClone(game) as GameState;
  const nextPlayers = players.map((player) => ({ ...player }));
  const hand = nextGame.hands[playerId];
  const player = nextPlayers.find((candidate) => candidate.id === playerId);

  if (!hand || !player || hand.folded) {
    throw new Error("Player is not active in this hand.");
  }

  if (action.type === "fold") {
    hand.folded = true;
    hand.acted = true;
    nextGame.message = `${player.name} folded`;
  } else if (action.type === "check") {
    if (hand.betThisRound !== nextGame.currentBet) {
      throw new Error("Cannot check while facing a bet.");
    }
    hand.acted = true;
    nextGame.message = `${player.name} checked`;
  } else if (action.type === "call") {
    const toCall = nextGame.currentBet - hand.betThisRound;
    if (toCall <= 0) {
      throw new Error("There is no bet to call.");
    }
    commitChips(player, hand, nextGame, toCall);
    hand.acted = true;
    nextGame.message = `${player.name} called`;
  } else if (action.type === "bet") {
    if (nextGame.currentBet > 0) {
      throw new Error("Use raise when a bet already exists.");
    }
    commitChips(player, hand, nextGame, action.amount);
    nextGame.currentBet = hand.betThisRound;
    hand.acted = true;
    markOthersUnacted(nextGame, playerId);
    nextGame.message = `${player.name} bet ${action.amount}`;
  } else if (action.type === "raise") {
    const toCall = nextGame.currentBet - hand.betThisRound;
    const totalCommit = toCall + action.amount;
    if (action.amount < nextGame.minRaise) {
      throw new Error(`Minimum raise is ${nextGame.minRaise}.`);
    }
    commitChips(player, hand, nextGame, totalCommit);
    nextGame.minRaise = action.amount;
    nextGame.currentBet = hand.betThisRound;
    hand.acted = true;
    markOthersUnacted(nextGame, playerId);
    nextGame.message = `${player.name} raised ${action.amount}`;
  }

  if (activePlayerIds(nextGame).length === 1) {
    const winnerId = activePlayerIds(nextGame)[0];
    nextGame.phase = "complete";
    nextGame.turnPlayerId = null;
    nextGame.winnerIds = [winnerId];
    nextGame.message = "Hand complete";
    return { game: nextGame, players: awardPot(nextPlayers, nextGame) };
  }

  if (shouldAdvanceBettingRound(nextGame)) {
    const advanced = nextGame.phase === "river" ? finishShowdown(nextGame) : advancePhase(nextGame);
    if (advanced.phase === "showdown") {
      return { game: advanced, players: awardPot(nextPlayers, advanced) };
    }
    return { game: advanced, players: nextPlayers };
  }

  nextGame.turnPlayerId = nextTurnPlayerId(nextGame, playerId);
  return { game: nextGame, players: nextPlayers };
}

export function awardPot(players: Player[], game: GameState): Player[] {
  if (game.winnerIds.length === 0 || game.pot === 0) {
    return players;
  }

  const share = Math.floor(game.pot / game.winnerIds.length);
  return players.map((player) =>
    game.winnerIds.includes(player.id) ? { ...player, chips: player.chips + share } : player,
  );
}

function commitChips(
  player: Player,
  hand: GameState["hands"][string],
  game: GameState,
  amount: number,
): void {
  const committed = Math.max(0, Math.min(player.chips, amount));
  player.chips -= committed;
  hand.betThisRound += committed;
  hand.committed += committed;
  game.pot += committed;
}

function markOthersUnacted(game: GameState, playerId: string): void {
  for (const hand of Object.values(game.hands)) {
    if (hand.playerId !== playerId && !hand.folded) {
      hand.acted = false;
    }
  }
}
