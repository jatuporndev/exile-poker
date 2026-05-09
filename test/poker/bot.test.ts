import assert from "node:assert/strict";
import test from "node:test";
import { chooseBotAction } from "../../src/features/poker/domain/bot";
import type { GameState } from "../../src/features/poker/domain/types";

test("bot checks when checking is available and random does not trigger a bet", () => {
  withRandom(0.5, () => {
    assert.deepEqual(chooseBotAction(botGame({ currentBet: 0 }), "bot"), { type: "check" });
  });
});

test("bot may bet the big blind when checking is available", () => {
  withRandom(0.1, () => {
    assert.deepEqual(chooseBotAction(botGame({ currentBet: 0 }), "bot"), { type: "bet", amount: 20 });
  });
});

test("bot folds to a large call sometimes and raises small calls sometimes", () => {
  withRandom(0.1, () => {
    assert.deepEqual(chooseBotAction(botGame({ currentBet: 100 }), "bot"), { type: "fold" });
  });

  withRandom(0.05, () => {
    assert.deepEqual(chooseBotAction(botGame({ currentBet: 20 }), "bot"), { type: "raise", amount: 20 });
  });
});

test("bot calls when facing a normal bet and has fallback actions", () => {
  withRandom(0.8, () => {
    assert.deepEqual(chooseBotAction(botGame({ currentBet: 20 }), "bot"), { type: "call" });
  });

  assert.deepEqual(chooseBotAction(botGame({ turnPlayerId: "human" }), "bot"), { type: "check" });
});

function withRandom(value: number, callback: () => void): void {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    callback();
  } finally {
    Math.random = originalRandom;
  }
}

function botGame(overrides: Partial<GameState>): GameState {
  return {
    dealerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    smallBlindPlayerId: "bot",
    bigBlindPlayerId: "human",
    phase: "preflop",
    turnPlayerId: "bot",
    pot: 0,
    currentBet: 0,
    minRaise: 20,
    communityCards: [],
    deck: [],
    hands: {
      bot: {
        playerId: "bot",
        cards: [],
        folded: false,
        allIn: false,
        betThisRound: 0,
        committed: 0,
        acted: false,
      },
      human: {
        playerId: "human",
        cards: [],
        folded: false,
        allIn: false,
        betThisRound: 0,
        committed: 0,
        acted: false,
      },
    },
    winnerIds: [],
    revealedPlayerIds: [],
    message: "",
    ...overrides,
  };
}
