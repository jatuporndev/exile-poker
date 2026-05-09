import { rankValues } from "./cards";
import type { Card } from "./types";

type EvaluatedHand = {
  score: number[];
  label: string;
};

const handLabels = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    return {
      score: [0, ...cards.map((card) => rankValues[card.rank]).sort(descending)],
      label: "High card",
    };
  }

  let best: EvaluatedHand | null = null;
  for (const combo of fiveCardCombinations(cards)) {
    const evaluated = evaluateFiveCards(combo);
    if (!best || compareScores(evaluated.score, best.score) > 0) {
      best = evaluated;
    }
  }

  return best ?? { score: [0], label: "High card" };
}

export function pickWinningPlayerIds(
  entries: { playerId: string; cards: Card[] }[],
): string[] {
  let bestScore: number[] | null = null;
  let winners: string[] = [];

  for (const entry of entries) {
    const evaluated = evaluateBestHand(entry.cards);
    const comparison = bestScore ? compareScores(evaluated.score, bestScore) : 1;

    if (comparison > 0) {
      bestScore = evaluated.score;
      winners = [entry.playerId];
    } else if (comparison === 0) {
      winners.push(entry.playerId);
    }
  }

  return winners;
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const values = cards.map((card) => rankValues[card.rank]).sort(descending);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);
  const counts = countValues(values);
  const groups = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (flush && straightHigh) {
    return withLabel([8, straightHigh]);
  }

  if (groups[0].count === 4) {
    const kicker = groups.find((group) => group.count === 1)?.value ?? 0;
    return withLabel([7, groups[0].value, kicker]);
  }

  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return withLabel([6, groups[0].value, groups[1].value]);
  }

  if (flush) {
    return withLabel([5, ...values]);
  }

  if (straightHigh) {
    return withLabel([4, straightHigh]);
  }

  if (groups[0].count === 3) {
    return withLabel([
      3,
      groups[0].value,
      ...groups.filter((group) => group.count === 1).map((group) => group.value),
    ]);
  }

  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairs = groups.filter((group) => group.count === 2).map((group) => group.value);
    const kicker = groups.find((group) => group.count === 1)?.value ?? 0;
    return withLabel([2, ...pairs, kicker]);
  }

  if (groups[0].count === 2) {
    return withLabel([
      1,
      groups[0].value,
      ...groups.filter((group) => group.count === 1).map((group) => group.value),
    ]);
  }

  return withLabel([0, ...values]);
}

function withLabel(score: number[]): EvaluatedHand {
  return {
    score,
    label: handLabels[score[0]] ?? "High card",
  };
}

function countValues(values: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function getStraightHigh(values: number[]): number | null {
  const unique = [...new Set(values)].sort(descending);
  if (unique.includes(14)) {
    unique.push(1);
  }

  for (let index = 0; index <= unique.length - 5; index += 1) {
    const run = unique.slice(index, index + 5);
    if (run[0] - run[4] === 4) {
      return run[0];
    }
  }

  return null;
}

function fiveCardCombinations(cards: Card[]): Card[][] {
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return combinations;
}

export function compareScores(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function descending(left: number, right: number): number {
  return right - left;
}
