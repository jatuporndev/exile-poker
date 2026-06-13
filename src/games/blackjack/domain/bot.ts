import { minBet } from "./gameState";
import { handValue } from "./rules";
import type { BlackjackAction, BlackjackGameState } from "./types";

/** A bot wagers a small flat amount each round. */
export const botBet = 50;

/**
 * Decides a bot's next move, or returns null when the bot has nothing to do
 * right now (someone else's turn, or it has already bet this round).
 */
export function chooseBlackjackBotAction(
  game: BlackjackGameState,
  botId: string,
): BlackjackAction | null {
  const hand = game.hands[botId];
  if (!hand) {
    return null;
  }

  if (game.phase === "betting") {
    if (hand.bet > 0 || hand.bankroll < minBet) {
      return null;
    }
    return { type: "bet", amount: Math.min(botBet, hand.bankroll) };
  }

  if (game.phase === "playing" && game.turnPlayerId === botId) {
    const { total, soft } = handValue(hand.cards);
    // Basic dealer-style strategy: hit anything below 17, and hit soft 17.
    if (total < 17 || (total === 17 && soft)) {
      return { type: "hit" };
    }
    return { type: "stand" };
  }

  return null;
}
