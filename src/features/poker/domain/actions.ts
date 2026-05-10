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
  if (toCall > 0) {
    return ["call", "raise", "fold"];
  }

  return game.currentBet > 0 ? ["check", "raise", "fold"] : ["check", "bet", "fold"];
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
    const committed = commitChips(player, hand, nextGame, toCall);
    hand.acted = true;
    nextGame.message = committed < toCall ? `${player.name} called ${committed} all-in` : `${player.name} called`;
  } else if (action.type === "bet") {
    if (nextGame.currentBet > 0) {
      throw new Error("Use raise when a bet already exists.");
    }
    const committed = commitChips(player, hand, nextGame, action.amount);
    nextGame.currentBet = hand.betThisRound;
    hand.acted = true;
    markOthersUnacted(nextGame, playerId);
    nextGame.message = `${player.name} bet ${committed}${committed < action.amount ? " all-in" : ""}`;
  } else if (action.type === "raise") {
    const toCall = nextGame.currentBet - hand.betThisRound;
    const totalCommit = toCall + action.amount;
    if (action.amount < nextGame.minRaise) {
      throw new Error(`Minimum raise is ${nextGame.minRaise}.`);
    }
    const committed = commitChips(player, hand, nextGame, totalCommit);
    const raiseBy = Math.max(0, committed - toCall);
    nextGame.minRaise = raiseBy > 0 ? raiseBy : nextGame.minRaise;
    nextGame.currentBet = hand.betThisRound;
    hand.acted = true;
    markOthersUnacted(nextGame, playerId);
    nextGame.message = `${player.name} raised ${committed}${committed < totalCommit ? " all-in" : ""}`;
  }

  return settleGameProgress(nextGame, nextPlayers, playerId);
}

export function settleGameProgress(
  game: GameState,
  players: Player[],
  currentPlayerId?: string,
): { game: GameState; players: Player[] } {
  const initialGame = structuredClone(game) as GameState;
  const activeIds = activePlayerIds(initialGame);
  if (activeIds.length === 1) {
    const winnerId = activeIds[0];
    const completeGame = {
      ...initialGame,
      phase: "complete" as const,
      turnPlayerId: null,
      winnerIds: [winnerId],
      message: "Hand complete",
    };
    return { game: completeGame, players: awardPot(players, completeGame) };
  }

  let settledGame = initialGame;
  let advancedBettingRound = false;
  while (shouldAdvanceBettingRound(settledGame, players)) {
    settledGame =
      settledGame.phase === "river"
        ? finishShowdown(settledGame)
        : advancePhase(settledGame, players);
    advancedBettingRound = true;

    if (settledGame.phase === "showdown") {
      return { game: settledGame, players: awardPot(players, settledGame) };
    }
  }

  if (!advancedBettingRound && currentPlayerId) {
    settledGame.turnPlayerId = nextTurnPlayerId(settledGame, currentPlayerId, players);
  }
  return { game: settledGame, players };
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
): number {
  const committed = Math.max(0, Math.min(player.chips, amount));
  player.chips -= committed;
  hand.betThisRound += committed;
  hand.committed += committed;
  hand.allIn = player.chips === 0;
  game.pot += committed;
  return committed;
}

function markOthersUnacted(game: GameState, playerId: string): void {
  for (const hand of Object.values(game.hands)) {
    if (hand.playerId !== playerId && !hand.folded) {
      hand.acted = false;
    }
  }
}
