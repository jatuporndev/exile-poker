import assert from "node:assert/strict";
import test from "node:test";
import { createUnoDeck, drawUnoCards, unoDeckSize } from "../../src/games/uno/domain/deck";

test("creates a complete 108-card UNO deck with unique ids", () => {
  const deck = createUnoDeck();

  assert.equal(deck.length, unoDeckSize);
  assert.equal(new Set(deck.map((card) => card.id)).size, unoDeckSize);
  assert.equal(deck.filter((card) => card.value === "wild4").length, 4);
  assert.equal(deck.filter((card) => card.value === "wild").length, 4);
  assert.equal(deck.filter((card) => card.value === "0").length, 4);
  assert.equal(deck.filter((card) => card.value === "draw2").length, 8);
});

test("drawUnoCards draws from the pile without mutating inputs", () => {
  const deck = createUnoDeck();
  const result = drawUnoCards(deck, [], 3);

  assert.deepEqual(result.cards, deck.slice(0, 3));
  assert.equal(result.drawPile.length, unoDeckSize - 3);
  assert.equal(deck.length, unoDeckSize);
});

test("drawUnoCards reshuffles the discard pile except the top visible card", () => {
  const deck = createUnoDeck();
  const discardPile = deck.slice(0, 10);
  const topCard = discardPile[discardPile.length - 1];

  const result = drawUnoCards([], discardPile, 5, () => 0);

  assert.equal(result.cards.length, 5);
  assert.deepEqual(result.discardPile, [topCard]);
  assert.equal(result.drawPile.length, 9 - 5);
  assert.ok(result.cards.every((card) => card.id !== topCard.id));
});

test("drawUnoCards keeps recycling piles across multiple exhaustions", () => {
  const deck = createUnoDeck();
  const discardPile = deck.slice(0, 4);

  // Only three cards are recyclable; asking for more returns what exists.
  const result = drawUnoCards([], discardPile, 10, () => 0);

  assert.equal(result.cards.length, 3);
  assert.equal(result.drawPile.length, 0);
  assert.equal(result.discardPile.length, 1);
});

test("drawUnoCards rejects invalid counts", () => {
  assert.throws(() => drawUnoCards([], [], -1), /non-negative integer/);
  assert.throws(() => drawUnoCards([], [], 1.5), /non-negative integer/);
});
