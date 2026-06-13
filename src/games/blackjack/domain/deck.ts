import { blackjackRanks, blackjackSuits } from "./types";
import type { BlackjackCard } from "./types";

/** Number of standard 52-card decks combined into the shoe. */
export const blackjackDeckCount = 4;
export const blackjackShoeSize = blackjackDeckCount * 52;

export function createBlackjackShoe(decks = blackjackDeckCount): BlackjackCard[] {
  const shoe: BlackjackCard[] = [];

  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of blackjackSuits) {
      for (const rank of blackjackRanks) {
        shoe.push({ id: `${suit}-${rank}-${deck}`, suit, rank });
      }
    }
  }

  return shoe;
}

export function shuffleBlackjackShoe(shoe: BlackjackCard[], random = Math.random): BlackjackCard[] {
  const shuffled = [...shoe];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

/** Reshuffle a fresh shoe once it runs this low, so a round never starves. */
export const reshuffleThreshold = 20;

export function freshShoeIfLow(
  shoe: BlackjackCard[],
  random = Math.random,
): BlackjackCard[] {
  if (shoe.length > reshuffleThreshold) {
    return shoe;
  }
  return shuffleBlackjackShoe(createBlackjackShoe(), random);
}
