import assert from "node:assert/strict";
import test from "node:test";
import { cardLabel, isRedSuit } from "../../src/features/poker/domain/cards";
import { compareScores, evaluateBestHand, pickWinningPlayerIds } from "../../src/features/poker/domain/handEvaluator";
import type { Card, Rank, Suit } from "../../src/features/poker/domain/types";

test("cardLabel and suit color helpers render expected card text", () => {
  assert.equal(cardLabel(card("A", "spades")), "A\u2660");
  assert.equal(cardLabel(card("10", "hearts")), "10\u2665");
  assert.equal(isRedSuit("hearts"), true);
  assert.equal(isRedSuit("diamonds"), true);
  assert.equal(isRedSuit("clubs"), false);
  assert.equal(isRedSuit("spades"), false);
});

test("evaluateBestHand identifies every hand category", () => {
  const examples: [string, Card[]][] = [
    ["Straight flush", cards(["9", "hearts"], ["10", "hearts"], ["J", "hearts"], ["Q", "hearts"], ["K", "hearts"])],
    ["Four of a kind", cards(["9", "clubs"], ["9", "diamonds"], ["9", "hearts"], ["9", "spades"], ["K", "clubs"])],
    ["Full house", cards(["Q", "clubs"], ["Q", "diamonds"], ["Q", "hearts"], ["7", "spades"], ["7", "clubs"])],
    ["Flush", cards(["2", "spades"], ["6", "spades"], ["9", "spades"], ["J", "spades"], ["K", "spades"])],
    ["Straight", cards(["5", "clubs"], ["6", "diamonds"], ["7", "hearts"], ["8", "spades"], ["9", "clubs"])],
    ["Three of a kind", cards(["4", "clubs"], ["4", "diamonds"], ["4", "hearts"], ["J", "spades"], ["A", "clubs"])],
    ["Two pair", cards(["8", "clubs"], ["8", "diamonds"], ["K", "hearts"], ["K", "spades"], ["3", "clubs"])],
    ["Pair", cards(["A", "clubs"], ["A", "diamonds"], ["5", "hearts"], ["9", "spades"], ["J", "clubs"])],
    ["High card", cards(["A", "clubs"], ["J", "diamonds"], ["8", "hearts"], ["6", "spades"], ["2", "clubs"])],
  ];

  for (const [label, hand] of examples) {
    assert.equal(evaluateBestHand(hand).label, label);
  }
});

test("evaluateBestHand handles wheel straights and chooses the best five of seven cards", () => {
  assert.deepEqual(
    evaluateBestHand(cards(["A", "clubs"], ["2", "diamonds"], ["3", "hearts"], ["4", "spades"], ["5", "clubs"])).score,
    [4, 5],
  );

  assert.equal(
    evaluateBestHand(
      cards(
        ["A", "hearts"],
        ["K", "hearts"],
        ["Q", "hearts"],
        ["J", "hearts"],
        ["10", "hearts"],
        ["2", "clubs"],
        ["2", "diamonds"],
      ),
    ).label,
    "Straight flush",
  );
});

test("evaluateBestHand handles partial hands as high-card scores", () => {
  assert.deepEqual(evaluateBestHand(cards(["A", "clubs"], ["5", "diamonds"], ["10", "hearts"])), {
    label: "High card",
    score: [0, 14, 10, 5],
  });
});

test("compareScores and pickWinningPlayerIds handle wins and ties", () => {
  assert.equal(compareScores([1, 14], [1, 13]), 1);
  assert.equal(compareScores([0, 10], [0, 10]), 0);
  assert.equal(compareScores([0, 9], [0, 10]), -1);

  assert.deepEqual(
    pickWinningPlayerIds([
      { playerId: "p1", cards: cards(["A", "clubs"], ["A", "diamonds"], ["5", "hearts"], ["9", "spades"], ["J", "clubs"]) },
      { playerId: "p2", cards: cards(["K", "clubs"], ["K", "diamonds"], ["5", "clubs"], ["9", "hearts"], ["J", "diamonds"]) },
    ]),
    ["p1"],
  );

  assert.deepEqual(
    pickWinningPlayerIds([
      { playerId: "p1", cards: cards(["A", "clubs"], ["K", "diamonds"], ["Q", "hearts"], ["J", "spades"], ["9", "clubs"]) },
      { playerId: "p2", cards: cards(["A", "diamonds"], ["K", "clubs"], ["Q", "spades"], ["J", "hearts"], ["9", "diamonds"]) },
    ]),
    ["p1", "p2"],
  );
});

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function cards(...entries: [Rank, Suit][]): Card[] {
  return entries.map(([rank, suit]) => card(rank, suit));
}
