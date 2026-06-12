import assert from "node:assert/strict";
import test from "node:test";
import { applyUnoAction } from "../../src/games/uno/domain/actions";
import { createUnoDeck } from "../../src/games/uno/domain/deck";
import { createInitialUnoGame, unoHandSize } from "../../src/games/uno/domain/gameState";
import { canPlayCard, canStackOn, mustStack } from "../../src/games/uno/domain/rules";
import type {
  UnoCard,
  UnoColor,
  UnoGameState,
  UnoPlayer,
  UnoValue,
} from "../../src/games/uno/domain/types";

function card(color: UnoCard["color"], value: UnoValue, copy = 0): UnoCard {
  return { id: `${color}-${value}-${copy}`, color, value };
}

function makePlayers(ids: string[]): UnoPlayer[] {
  return ids.map((id, index) => ({
    id,
    name: id,
    seat: index,
    connected: true,
  }));
}

function makeGame(overrides: Partial<UnoGameState>): UnoGameState {
  return {
    phase: "playing",
    direction: 1,
    turnPlayerId: "a",
    activeColor: "red",
    drawPile: createUnoDeck(),
    discardPile: [card("red", "5")],
    hands: {},
    pendingDraw: 0,
    drawnCardId: null,
    winnerId: null,
    message: "",
    startedAt: 0,
    ...overrides,
  };
}

test("normal play matches active color or top value, wilds always work", () => {
  const game = makeGame({
    activeColor: "red",
    discardPile: [card("red", "5")],
  });

  assert.ok(canPlayCard(game, card("red", "9")));
  assert.ok(canPlayCard(game, card("blue", "5")));
  assert.ok(canPlayCard(game, card("wild", "wild")));
  assert.ok(canPlayCard(game, card("wild", "wild4")));
  assert.ok(!canPlayCard(game, card("blue", "9")));
});

test("a +4 can stack on a +2, but a +2 cannot stack on a +4", () => {
  const draw2 = card("red", "draw2");
  const wild4 = card("wild", "wild4");

  assert.ok(canStackOn(card("blue", "draw2"), draw2));
  assert.ok(canStackOn(wild4, draw2));
  assert.ok(canStackOn(card("wild", "wild4", 1), wild4));
  assert.ok(!canStackOn(card("blue", "draw2"), wild4));
});

test("while a penalty is pending only stackable draw cards are playable", () => {
  const game = makeGame({
    pendingDraw: 2,
    activeColor: "red",
    discardPile: [card("red", "draw2")],
  });

  // Even a perfect color/value match is rejected during a stack.
  assert.ok(!canPlayCard(game, card("red", "9")));
  assert.ok(!canPlayCard(game, card("wild", "wild")));
  assert.ok(canPlayCard(game, card("blue", "draw2")));
  assert.ok(canPlayCard(game, card("wild", "wild4")));
});

test("stacking accumulates the penalty and the loser draws it all", () => {
  const players = makePlayers(["a", "b", "c"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    discardPile: [card("red", "5")],
    hands: {
      a: [card("red", "draw2"), card("red", "1")],
      b: [card("blue", "draw2"), card("blue", "1")],
      c: [card("wild", "wild4"), card("green", "1")],
    },
  });

  game = applyUnoAction(game, players, "a", { type: "play", cardId: "red-draw2-0" });
  assert.equal(game.pendingDraw, 2);
  assert.equal(game.turnPlayerId, "b");

  game = applyUnoAction(game, players, "b", { type: "play", cardId: "blue-draw2-0" });
  assert.equal(game.pendingDraw, 4);
  assert.equal(game.turnPlayerId, "c");

  // +4 lands on the +2 stack and raises it.
  game = applyUnoAction(game, players, "c", {
    type: "play",
    cardId: "wild-wild4-0",
    chosenColor: "green",
  });
  assert.equal(game.pendingDraw, 8);
  assert.equal(game.activeColor, "green");
  assert.equal(game.turnPlayerId, "a");

  // a only has a +2 left, which cannot answer a +4 — drawing is the only move.
  assert.ok(!mustStack(game, game.hands.a));
  const handBefore = game.hands.a.length;
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.hands.a.length, handBefore + 8);
  assert.equal(game.pendingDraw, 0);
  assert.equal(game.turnPlayerId, "b");
});

test("players holding a stackable card must stack instead of drawing", () => {
  const players = makePlayers(["a", "b"]);
  const game = makeGame({
    turnPlayerId: "a",
    pendingDraw: 2,
    discardPile: [card("red", "draw2")],
    hands: {
      a: [card("blue", "draw2"), card("red", "9")],
      b: [card("blue", "1")],
    },
  });

  assert.ok(mustStack(game, game.hands.a));
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "draw" }),
    /must stack/,
  );
});

test("playing a non-stackable card during a stack is rejected", () => {
  const players = makePlayers(["a", "b"]);
  const game = makeGame({
    turnPlayerId: "a",
    pendingDraw: 4,
    activeColor: "red",
    discardPile: [card("wild", "wild4")],
    hands: {
      a: [card("red", "draw2"), card("red", "9")],
      b: [card("blue", "1")],
    },
  });

  // +2 on a +4 violates the house rule.
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "play", cardId: "red-draw2-0" }),
    /must stack a matching draw card|penalty/,
  );
});

test("drawing takes one card per action and a playable draw waits to be played", () => {
  const players = makePlayers(["a", "b"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    drawPile: [card("blue", "9"), card("green", "3"), card("red", "7"), card("yellow", "2")],
    discardPile: [card("red", "5")],
    hands: {
      a: [card("blue", "1")],
      b: [card("green", "1")],
    },
  });

  // First two draws are unplayable: each takes exactly one card and keeps the turn.
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.hands.a.length, 2);
  assert.equal(game.drawnCardId, null);
  assert.equal(game.turnPlayerId, "a");
  assert.match(game.message, /nothing playable yet/);

  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.hands.a.length, 3);
  assert.equal(game.turnPlayerId, "a");

  // The third draw (red 7) is playable: it is only marked, never auto-played.
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.hands.a.length, 4);
  assert.equal(game.drawnCardId, "red-7-0");
  assert.equal(game.turnPlayerId, "a");
  assert.equal(game.discardPile[game.discardPile.length - 1].id, "red-5-0");
  assert.match(game.message, /must play it/);

  // Until the drawn card is played, no other draw or play is allowed.
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "draw" }),
    /must play the card you just drew/,
  );
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "play", cardId: "blue-1-0" }),
    /must play the card you just drew/,
  );

  // The player plays the drawn card themselves.
  game = applyUnoAction(game, players, "a", { type: "play", cardId: "red-7-0" });
  assert.equal(game.discardPile[game.discardPile.length - 1].id, "red-7-0");
  assert.equal(game.drawnCardId, null);
  assert.equal(game.turnPlayerId, "b");
  assert.equal(game.hands.a.length, 3);
});

test("drawing is rejected while the player still holds a playable card", () => {
  const players = makePlayers(["a", "b"]);
  const game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    discardPile: [card("red", "5")],
    hands: {
      a: [card("red", "9"), card("blue", "1")],
      b: [card("green", "1")],
    },
  });

  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "draw" }),
    /playable card — you must play it/,
  );
});

test("a drawn wild must be played once its color is chosen", () => {
  const players = makePlayers(["a", "b"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    drawPile: [card("blue", "9"), card("wild", "wild")],
    discardPile: [card("red", "5")],
    hands: {
      a: [card("blue", "1")],
      b: [card("green", "1")],
    },
  });

  // The blue 9 comes first and is unplayable; the wild arrives on the second draw.
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.drawnCardId, null);
  assert.equal(game.turnPlayerId, "a");

  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.drawnCardId, "wild-wild-0");
  assert.equal(game.turnPlayerId, "a");

  // Neither another play nor another draw is allowed before the wild is played.
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "play", cardId: "blue-1-0" }),
    /must play the card you just drew/,
  );
  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "draw" }),
    /must play the card you just drew/,
  );

  game = applyUnoAction(game, players, "a", {
    type: "play",
    cardId: "wild-wild-0",
    chosenColor: "green",
  });
  assert.equal(game.activeColor, "green");
  assert.equal(game.drawnCardId, null);
  assert.equal(game.turnPlayerId, "b");
});

test("drawing passes the turn when no playable card exists anywhere", () => {
  const players = makePlayers(["a", "b"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    drawPile: [card("blue", "9")],
    discardPile: [card("red", "5")],
    hands: {
      a: [card("blue", "1")],
      b: [card("green", "1")],
    },
  });

  // The single unplayable card is drawn first; the turn stays with the player.
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.drawnCardId, null);
  assert.equal(game.turnPlayerId, "a");
  assert.equal(game.hands.a.length, 2);

  // With every card in play, the next draw finds nothing and the turn passes.
  game = applyUnoAction(game, players, "a", { type: "draw" });
  assert.equal(game.turnPlayerId, "b");
  assert.equal(game.hands.a.length, 2);
  assert.match(game.message, /cannot draw/);
});

test("reverse flips direction and skip jumps a player", () => {
  const players = makePlayers(["a", "b", "c"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    hands: {
      a: [card("red", "reverse"), card("red", "skip"), card("red", "1")],
      b: [card("blue", "1")],
      c: [card("green", "1")],
    },
  });

  game = applyUnoAction(game, players, "a", { type: "play", cardId: "red-reverse-0" });
  assert.equal(game.direction, -1);
  assert.equal(game.turnPlayerId, "c");

  game.turnPlayerId = "a";
  game = applyUnoAction(game, players, "a", { type: "play", cardId: "red-skip-0" });
  // Direction is reversed, so the skip jumps over c and lands on b.
  assert.equal(game.turnPlayerId, "b");
});

test("playing the last card wins the game", () => {
  const players = makePlayers(["a", "b"]);
  let game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    hands: {
      a: [card("red", "3")],
      b: [card("blue", "1")],
    },
  });

  game = applyUnoAction(game, players, "a", { type: "play", cardId: "red-3-0" });
  assert.equal(game.phase, "finished");
  assert.equal(game.winnerId, "a");
  assert.equal(game.turnPlayerId, null);
});

test("wild plays require a chosen color", () => {
  const players = makePlayers(["a", "b"]);
  const game = makeGame({
    turnPlayerId: "a",
    activeColor: "red",
    hands: {
      a: [card("wild", "wild"), card("red", "1")],
      b: [card("blue", "1")],
    },
  });

  assert.throws(
    () => applyUnoAction(game, players, "a", { type: "play", cardId: "wild-wild-0" }),
    /Choose a color/,
  );

  const next = applyUnoAction(game, players, "a", {
    type: "play",
    cardId: "wild-wild-0",
    chosenColor: "blue" as UnoColor,
  });
  assert.equal(next.activeColor, "blue");
});

test("initial deal gives everyone seven cards and starts on a number card", () => {
  const players = makePlayers(["a", "b", "c"]);
  const game = createInitialUnoGame(players);

  for (const player of players) {
    assert.equal(game.hands[player.id].length, unoHandSize);
  }
  const top = game.discardPile[game.discardPile.length - 1];
  assert.match(top.value, /^[0-9]$/);
  assert.equal(game.activeColor, top.color);
  assert.equal(game.pendingDraw, 0);
  assert.equal(game.turnPlayerId, "a");

  const totalCards =
    game.drawPile.length +
    game.discardPile.length +
    Object.values(game.hands).reduce((sum, hand) => sum + hand.length, 0);
  assert.equal(totalCards, 108);
});
