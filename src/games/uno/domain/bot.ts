import { mostCommonColor, playableCards } from "./rules";
import type { UnoAction, UnoCard, UnoGameState } from "./types";

export function chooseUnoBotAction(game: UnoGameState, botId: string): UnoAction {
  const hand = game.hands[botId] ?? [];

  // A drawn wild must be played before anything else.
  if (game.drawnCardId) {
    const drawnCard = hand.find((card) => card.id === game.drawnCardId);
    if (drawnCard) {
      return playAction(drawnCard, hand);
    }
  }

  const playable = playableCards(game, hand);
  if (playable.length === 0) {
    return { type: "draw" };
  }

  // Hold wilds back unless nothing else matches.
  const preferred =
    playable.find((card) => card.color !== "wild") ?? playable[0];
  return playAction(preferred, hand);
}

function playAction(card: UnoCard, hand: UnoCard[]): UnoAction {
  if (card.color === "wild") {
    const remaining = hand.filter((candidate) => candidate.id !== card.id);
    return { type: "play", cardId: card.id, chosenColor: mostCommonColor(remaining) };
  }
  return { type: "play", cardId: card.id };
}
