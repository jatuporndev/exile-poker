import { getAvailableActions } from "./actions";
import type { GameState, PokerAction } from "./types";

export function chooseBotAction(game: GameState, playerId: string): PokerAction {
  const actions = getAvailableActions(game, playerId);
  const hand = game.hands[playerId];

  if (!hand || actions.length === 0) {
    return { type: "check" };
  }

  const toCall = game.currentBet - hand.betThisRound;
  const cautiousFold = toCall > game.bigBlind * 2 && Math.random() < 0.42;

  if (actions.includes("check")) {
    if (actions.includes("bet") && Math.random() < 0.18) {
      return { type: "bet", amount: game.bigBlind };
    }
    return { type: "check" };
  }

  if (actions.includes("call")) {
    if (cautiousFold && actions.includes("fold")) {
      return { type: "fold" };
    }

    if (actions.includes("raise") && toCall <= game.bigBlind && Math.random() < 0.12) {
      return { type: "raise", amount: game.minRaise };
    }

    return { type: "call" };
  }

  if (actions.includes("fold")) {
    return { type: "fold" };
  }

  return { type: "check" };
}
