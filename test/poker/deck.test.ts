import assert from "node:assert/strict";
import test from "node:test";
import { assertValidDeck, cardKey, createDeck, drawCards, shuffleDeck, standardDeckSize } from "../../src/features/poker/domain/deck";
import type { Card } from "../../src/features/poker/domain/types";

test("creates a complete unique standard deck", () => {
  const deck = createDeck();

  assert.equal(deck.length, standardDeckSize);
  assert.equal(new Set(deck.map(cardKey)).size, standardDeckSize);
  assert.deepEqual(deck[0], { rank: "2", suit: "clubs" });
  assert.deepEqual(deck.at(-1), { rank: "A", suit: "spades" });
});

test("drawCards returns drawn cards and leaves the source deck unchanged", () => {
  const deck = createDeck();
  const result = drawCards(deck, 3);

  assert.deepEqual(result.cards, deck.slice(0, 3));
  assert.deepEqual(result.deck, deck.slice(3));
  assert.equal(deck.length, standardDeckSize);
});

test("drawCards rejects invalid counts", () => {
  const deck = createDeck();

  assert.throws(() => drawCards(deck, -1), /non-negative integer/);
  assert.throws(() => drawCards(deck, 1.5), /non-negative integer/);
  assert.throws(() => drawCards(deck, standardDeckSize + 1), /Cannot draw/);
});

test("shuffleDeck is deterministic with an injected random source and keeps all cards", () => {
  const deck: Card[] = [
    { rank: "2", suit: "clubs" },
    { rank: "3", suit: "clubs" },
    { rank: "4", suit: "clubs" },
    { rank: "5", suit: "clubs" },
    ...createDeck().slice(4),
  ];
  const shuffled = shuffleDeck(deck, () => 0);

  assert.equal(shuffled.length, standardDeckSize);
  assert.equal(new Set(shuffled.map(cardKey)).size, standardDeckSize);
  assert.notStrictEqual(shuffled, deck);
});

test("assertValidDeck rejects wrong-size and duplicate decks", () => {
  const deck = createDeck();

  assert.throws(() => assertValidDeck(deck.slice(1)), /must contain/);
  assert.throws(() => assertValidDeck([deck[0], ...deck.slice(0, -1)]), /duplicate/);
});
