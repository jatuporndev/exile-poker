import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPokerAction,
  awardPot,
  getAvailableActions,
  settleGameProgress,
} from "../../src/features/poker/domain/actions";
import {
  activeBettingHands,
  activePlayerIds,
  advancePhase,
  areBetsSettled,
  createInitialGame,
  firstActivePlayerId,
  finishShowdown,
  nextTurnPlayerId,
  onlyOnePlayerCanStillBet,
  shouldAdvanceBettingRound,
} from "../../src/features/poker/domain/gameState";
import type { Card, GameState, Player } from "../../src/features/poker/domain/types";

const testDeck: Card[] = [
  { rank: "2", suit: "clubs" },
  { rank: "7", suit: "diamonds" },
  { rank: "A", suit: "spades" },
  { rank: "K", suit: "hearts" },
  { rank: "5", suit: "clubs" },
  { rank: "9", suit: "spades" },
  { rank: "3", suit: "hearts" },
  { rank: "J", suit: "diamonds" },
  { rank: "4", suit: "clubs" },
  { rank: "Q", suit: "clubs" },
];

test("createInitialGame deals cards, posts blinds, and filters busted players", () => {
  const players = playersWithChips([1000, 1000, 0]);
  const game = createInitialGame(players);

  assert.equal(Object.keys(game.hands).length, 2);
  assert.equal(game.pot, 30);
  assert.equal(game.currentBet, 20);
  assert.equal(players[0].chips, 990);
  assert.equal(players[1].chips, 980);
  assert.equal(players[2].chips, 0);
  assert.equal(game.hands.p1.cards.length, 2);
  assert.equal(game.hands.p2.cards.length, 2);
  assert.equal(game.hands.p3, undefined);
  assert.equal(game.smallBlindPlayerId, "p1");
  assert.equal(game.bigBlindPlayerId, "p2");
  assert.equal(game.turnPlayerId, "p1");
});

test("createInitialGame rejects tables with fewer than two funded players", () => {
  assert.throws(() => createInitialGame(playersWithChips([1000, 0])), /At least two players/);
});

test("createInitialGame rotates dealer and blinds to the next seat on a new hand", () => {
  const players = playersWithChips([1000, 1000, 1000]);

  const firstHand = createInitialGame(playersWithChips([1000, 1000, 1000]));
  const nextHand = createInitialGame(players, firstHand.dealerSeat);

  assert.equal(firstHand.dealerSeat, 0);
  assert.equal(firstHand.smallBlindPlayerId, "p2");
  assert.equal(firstHand.bigBlindPlayerId, "p3");
  assert.equal(firstHand.turnPlayerId, "p1");

  assert.equal(nextHand.dealerSeat, 1);
  assert.equal(nextHand.smallBlindPlayerId, "p3");
  assert.equal(nextHand.bigBlindPlayerId, "p1");
  assert.equal(nextHand.turnPlayerId, "p2");
});

test("getAvailableActions reflects turn, folded, check, call, and showdown states", () => {
  const game = baseGame();

  assert.deepEqual(getAvailableActions(game, "p2"), ["call", "raise", "fold"]);
  assert.deepEqual(getAvailableActions({ ...game, turnPlayerId: "p1", currentBet: 0, hands: { ...game.hands, p1: { ...game.hands.p1, betThisRound: 0 } } }, "p1"), ["check", "bet", "fold"]);
  assert.deepEqual(getAvailableActions({ ...game, turnPlayerId: "p1" }, "p1"), ["check", "raise", "fold"]);
  assert.deepEqual(getAvailableActions({ ...game, phase: "showdown" }, "p2"), []);
  assert.deepEqual(getAvailableActions({ ...game, hands: { ...game.hands, p2: { ...game.hands.p2, folded: true } } }, "p2"), []);
  assert.deepEqual(getAvailableActions(game, "missing"), []);
});

test("applyPokerAction rejects invalid turns and unavailable actions", () => {
  assert.throws(() => applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p1", { type: "call" }), /not this player's turn/);
  assert.throws(() => applyPokerAction({ ...baseGame(), turnPlayerId: "missing" }, playersWithChips([900, 1000]), "missing", { type: "fold" }), /not active/);
  assert.throws(() => applyPokerAction({ ...baseGame(), hands: { ...baseGame().hands, p2: { ...baseGame().hands.p2, folded: true } } }, playersWithChips([900, 1000]), "p2", { type: "fold" }), /not active/);
  assert.throws(() => applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p2", { type: "check" }), /Cannot check/);
  assert.throws(() => applyPokerAction({ ...baseGame(), currentBet: 0 }, playersWithChips([900, 1000]), "p2", { type: "call" }), /There is no bet/);
  assert.throws(() => applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p2", { type: "bet", amount: 100 }), /Use raise/);
  assert.throws(() => applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p2", { type: "raise", amount: 5 }), /Minimum raise/);
});

test("call updates pot, chips, hand commitment, and advances settled betting round", () => {
  const result = applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p2", { type: "call" });

  assert.equal(result.players[1].chips, 900);
  assert.equal(result.game.pot, 200);
  assert.equal(result.game.hands.p2.committed, 100);
  assert.equal(result.game.phase, "flop");
  assert.equal(result.game.currentBet, 0);
  assert.equal(result.game.communityCards.length, 3);
});

test("bet and raise messages use actual committed chips for all-in actions", () => {
  const betResult = applyPokerAction(noBetGame(), playersWithChips([100, 300]), "p1", { type: "bet", amount: 500 });
  assert.equal(betResult.players[0].chips, 0);
  assert.equal(betResult.game.hands.p1.allIn, true);
  assert.equal(betResult.game.message, "Player 1 bet 100 all-in");

  const raiseResult = applyPokerAction(baseGame(), playersWithChips([900, 300]), "p2", { type: "raise", amount: 1000 });
  assert.equal(raiseResult.players[1].chips, 0);
  assert.equal(raiseResult.game.hands.p2.allIn, true);
  assert.equal(raiseResult.game.message, "Player 2 raised 300 all-in");
});

test("fold completes the hand and awards the pot to the remaining player", () => {
  const result = applyPokerAction(baseGame(), playersWithChips([900, 1000]), "p2", { type: "fold" });

  assert.equal(result.game.phase, "complete");
  assert.deepEqual(result.game.winnerIds, ["p1"]);
  assert.equal(result.players[0].chips, 1000);
});

test("check advances through streets and reaches showdown after river", () => {
  const flop = {
    ...noBetGame(),
    phase: "flop" as const,
    communityCards: testDeck.slice(4, 7),
    turnPlayerId: "p1",
  };
  const afterP1 = applyPokerAction(flop, playersWithChips([1000, 1000]), "p1", { type: "check" });
  assert.equal(afterP1.game.phase, "flop");
  assert.equal(afterP1.game.turnPlayerId, "p2");

  const afterP2 = applyPokerAction(afterP1.game, afterP1.players, "p2", { type: "check" });
  assert.equal(afterP2.game.phase, "turn");
  assert.equal(afterP2.game.communityCards.length, 4);

  const riverReady = {
    ...afterP2.game,
    phase: "river" as const,
    communityCards: testDeck.slice(4, 9),
    turnPlayerId: "p2",
    hands: {
      p1: { ...afterP2.game.hands.p1, acted: true, betThisRound: 0 },
      p2: { ...afterP2.game.hands.p2, acted: false, betThisRound: 0 },
    },
  };
  const showdown = applyPokerAction(riverReady, afterP2.players, "p2", { type: "check" });
  assert.equal(showdown.game.phase, "showdown");
  assert.equal(showdown.game.turnPlayerId, null);
});

test("keeps action on a player who still needs to answer an all-in bet", () => {
  const players = playersWithChips([0, 700]);
  const game = allInFacingCallGame();

  assert.equal(onlyOnePlayerCanStillBet(game, players), true);
  assert.equal(areBetsSettled(game, players), false);
  assert.equal(shouldAdvanceBettingRound(game, players), false);

  const result = settleGameProgress(game, players, "p1");

  assert.equal(result.game.phase, "preflop");
  assert.equal(result.game.turnPlayerId, "p2");
  assert.equal(result.game.communityCards.length, 0);
});

test("auto-runs to showdown after the last player calls an all-in bet", () => {
  const result = applyPokerAction(allInFacingCallGame(), playersWithChips([0, 700]), "p2", { type: "call" });

  assert.equal(result.game.phase, "showdown");
  assert.equal(result.game.turnPlayerId, null);
  assert.equal(result.game.communityCards.length, 5);
});

test("turn helpers skip folded and all-in players", () => {
  const players = playersWithChips([0, 100, 100]);
  const game = threePlayerGame();

  assert.deepEqual(activeBettingHands(game, players).map((hand) => hand.playerId), ["p2", "p3"]);
  assert.equal(firstActivePlayerId(game, players), "p2");
  assert.equal(nextTurnPlayerId(game, "p2", players), "p3");
  assert.equal(nextTurnPlayerId({ ...game, hands: { ...game.hands, p3: { ...game.hands.p3, folded: true } } }, "p2", players), null);
  assert.equal(nextTurnPlayerId(game, "missing", players), "p2");
});

test("turn helpers and new hands skip disconnected players", () => {
  const players = playersWithChips([1000, 1000, 1000]);
  players[1].connected = false;
  const game = createInitialGame(players);

  assert.equal(Object.keys(game.hands).length, 2);
  assert.equal(game.hands.p2, undefined);
  assert.equal(firstActivePlayerId(threePlayerGame(), players), "p3");
  assert.equal(nextTurnPlayerId(threePlayerGame(), "p1", players), "p3");
});

test("phase helpers advance flop, turn, river, and showdown directly", () => {
  const players = playersWithChips([1000, 1000]);
  const preflop = noBetGame();

  assert.deepEqual(activePlayerIds({ ...preflop, hands: { ...preflop.hands, p2: { ...preflop.hands.p2, folded: true } } }), ["p1"]);

  const flop = advancePhase(preflop, players);
  assert.equal(flop.phase, "flop");
  assert.equal(flop.communityCards.length, 3);
  assert.equal(flop.turnPlayerId, "p2");

  const turn = advancePhase(flop, players);
  assert.equal(turn.phase, "turn");
  assert.equal(turn.communityCards.length, 4);

  const river = advancePhase(turn, players);
  assert.equal(river.phase, "river");
  assert.equal(river.communityCards.length, 5);

  const showdown = advancePhase(river, players);
  assert.equal(showdown.phase, "showdown");
  assert.equal(showdown.turnPlayerId, null);
  assert.deepEqual(finishShowdown(river).winnerIds, showdown.winnerIds);
});

test("betting round advances when all active players are all-in or only one checked player can bet", () => {
  const noActionGame = {
    ...allInFacingCallGame(),
    hands: {
      ...allInFacingCallGame().hands,
      p2: { ...allInFacingCallGame().hands.p2, allIn: true, betThisRound: 300, acted: true },
    },
  };
  assert.equal(shouldAdvanceBettingRound(noActionGame, playersWithChips([0, 0])), true);

  const checkedGame = {
    ...noBetGame(),
    hands: {
      p1: { ...noBetGame().hands.p1, allIn: true },
      p2: { ...noBetGame().hands.p2, acted: true },
    },
  };
  assert.equal(shouldAdvanceBettingRound(checkedGame, playersWithChips([0, 100])), true);
});

test("awardPot splits odd chips with integer shares", () => {
  const winners = awardPot(playersWithChips([10, 20, 30]), {
    ...threePlayerGame(),
    pot: 101,
    winnerIds: ["p1", "p3"],
  });

  assert.deepEqual(winners.map((player) => player.chips), [60, 20, 80]);
  assert.strictEqual(awardPot(playersWithChips([10, 20]), { ...noBetGame(), pot: 0, winnerIds: ["p1"] })[0].chips, 10);
  assert.strictEqual(awardPot(playersWithChips([10, 20]), { ...noBetGame(), pot: 100, winnerIds: [] })[0].chips, 10);
});

function playersWithChips(chips: number[]): Player[] {
  return chips.map((chipCount, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index,
    chips: chipCount,
    connected: true,
  }));
}

function baseGame(): GameState {
  return {
    ...noBetGame(),
    turnPlayerId: "p2",
    pot: 100,
    currentBet: 100,
    hands: {
      p1: {
        ...noBetGame().hands.p1,
        betThisRound: 100,
        committed: 100,
        acted: true,
      },
      p2: noBetGame().hands.p2,
    },
    message: "Player 1 bet 100",
  };
}

function noBetGame(): GameState {
  return {
    dealerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    smallBlindPlayerId: "p1",
    bigBlindPlayerId: "p2",
    phase: "preflop",
    turnPlayerId: "p1",
    pot: 0,
    currentBet: 0,
    minRaise: 20,
    communityCards: [],
    deck: testDeck.slice(4),
    hands: {
      p1: {
        playerId: "p1",
        cards: testDeck.slice(0, 2),
        folded: false,
        allIn: false,
        betThisRound: 0,
        committed: 0,
        acted: false,
      },
      p2: {
        playerId: "p2",
        cards: testDeck.slice(2, 4),
        folded: false,
        allIn: false,
        betThisRound: 0,
        committed: 0,
        acted: false,
      },
    },
    winnerIds: [],
    revealedPlayerIds: [],
    message: "Preflop betting",
  };
}

function allInFacingCallGame(): GameState {
  return {
    ...noBetGame(),
    turnPlayerId: "p2",
    pot: 300,
    currentBet: 300,
    hands: {
      p1: {
        ...noBetGame().hands.p1,
        allIn: true,
        betThisRound: 300,
        committed: 300,
        acted: true,
      },
      p2: noBetGame().hands.p2,
    },
    message: "Player 1 raised 300 all-in",
  };
}

function threePlayerGame(): GameState {
  return {
    ...noBetGame(),
    hands: {
      ...noBetGame().hands,
      p3: {
        playerId: "p3",
        cards: testDeck.slice(4, 6),
        folded: false,
        allIn: false,
        betThisRound: 0,
        committed: 0,
        acted: false,
      },
    },
  };
}
