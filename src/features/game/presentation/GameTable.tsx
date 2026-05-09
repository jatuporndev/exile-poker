"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  leaveOnlineRoom,
  normalizeRoomCode,
  saveOnlineRoom,
  subscribeToOnlineRoom,
  trackRoomPresence,
} from "../../rooms/data/firebaseRooms";
import { applyPokerAction, getAvailableActions, settleGameProgress } from "../../poker/domain/actions";
import { chooseBotAction } from "../../poker/domain/bot";
import { cardLabel, isRedSuit } from "../../poker/domain/cards";
import { createInitialGame } from "../../poker/domain/gameState";
import { evaluateBestHand } from "../../poker/domain/handEvaluator";
import type { Card, HandPhase, PokerAction, Room } from "../../poker/domain/types";
import { getOrCreateLocalPlayer } from "../../../shared/local/playerSession";
import styles from "./GameTable.module.css";

export function GameTable({ roomId: rawRoomId }: { roomId: string }) {
  const router = useRouter();
  const roomId = useMemo(() => normalizeRoomCode(rawRoomId), [rawRoomId]);
  const [room, setRoom] = useState<Room | null>(null);
  const [amount, setAmount] = useState(20);
  const [chipStep, setChipStep] = useState(10);
  const [error, setError] = useState("");
  const [showWinGuide, setShowWinGuide] = useState(false);
  const [localPlayerId, setLocalPlayerId] = useState("");
  const [dealtCardCount, setDealtCardCount] = useState(0);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  useEffect(() => {
    setLocalPlayerId(getOrCreateLocalPlayer().id);
    return subscribeToOnlineRoom(roomId, setRoom);
  }, [roomId]);

  useEffect(() => {
    if (!localPlayerId) {
      return;
    }

    return trackRoomPresence(roomId, localPlayerId);
  }, [localPlayerId, roomId]);

  const game = room?.game ?? null;
  const visiblePlayers = room?.players.filter((player) => player.connected || player.isSimulated) ?? [];
  const turnPlayer = room?.players.find((player) => player.id === game?.turnPlayerId);
  const winners = game?.winnerIds
    .map((winnerId) => room?.players.find((player) => player.id === winnerId)?.name)
    .filter(Boolean)
    .join(", ");
  const localPlayer = room?.players.find((player) => player.id === localPlayerId);
  const tablePlayers = room
    ? [
        ...visiblePlayers.filter((player) => player.id !== localPlayerId),
        ...(localPlayer ? [localPlayer] : []),
      ]
    : [];
  const stage = game ? getGameStage(game.phase) : null;
  const dealAnimationKey = game
    ? Object.values(game.hands)
        .map((hand) => `${hand.playerId}:${hand.cards.map(cardLabel).join(",")}`)
        .join("|")
    : "";
  const totalHoleCards = tablePlayers.length * 2;

  useEffect(() => {
    if (!dealAnimationKey || game?.phase !== "preflop") {
      setDealtCardCount(Number.POSITIVE_INFINITY);
      return;
    }

    setDealtCardCount(0);
    const timers = Array.from({ length: totalHoleCards }, (_, index) =>
      setTimeout(() => {
        setDealtCardCount(index + 1);
      }, index * 260),
    );

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [dealAnimationKey, game?.phase, totalHoleCards]);

  const updateRoom = useCallback((nextRoom: Room) => {
    void saveOnlineRoom(nextRoom);
    setRoom(nextRoom);
  }, []);

  const handleAction = useCallback((action: PokerAction) => {
    if (!room?.game?.turnPlayerId) {
      return;
    }

    try {
      const result = applyPokerAction(room.game, room.players, room.game.turnPlayerId, action);
      updateRoom({ ...room, game: result.game, players: result.players, status: "playing" });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }, [room, updateRoom]);

  useEffect(() => {
    if (!room?.game?.turnPlayerId || localPlayerId !== room.hostId) {
      return;
    }

    const bot = room.players.find(
      (player) => player.id === room.game?.turnPlayerId && player.isSimulated,
    );
    if (!bot) {
      return;
    }

    const timer = setTimeout(() => {
      if (!room.game) {
        return;
      }
      handleAction(chooseBotAction(room.game, bot.id));
    }, 700);

    return () => clearTimeout(timer);
  }, [handleAction, localPlayerId, room]);

  useEffect(() => {
    if (!room?.game || localPlayerId !== room.hostId) {
      return;
    }

    const turnPlayerId = room.game.turnPlayerId;
    const turnPlayer = room.players.find((player) => player.id === turnPlayerId);
    const turnPlayerChips = turnPlayer?.chips ?? 0;
    const needsProgress =
      (turnPlayerId && (!turnPlayer?.connected || turnPlayerChips <= 0)) ||
      (!turnPlayerId &&
        room.game.phase !== "showdown" &&
        room.game.phase !== "complete" &&
        room.game.phase !== "lobby");

    if (!needsProgress) {
      return;
    }

    const timer = setTimeout(() => {
      if (!room.game) {
        return;
      }
      const result = settleGameProgress(room.game, room.players, turnPlayerId ?? undefined);
      updateRoom({ ...room, game: result.game, players: result.players, status: "playing" });
    }, 300);

    return () => clearTimeout(timer);
  }, [localPlayerId, room, updateRoom]);

  function handleNewHand() {
    if (!room) {
      return;
    }

    try {
      const playersWithChips = visiblePlayers.filter((player) => player.chips > 0);
      if (playersWithChips.length < 2) {
        throw new Error("At least two players need chips to start a hand.");
      }

      updateRoom({
        ...room,
        status: "playing",
        game: createInitialGame(visiblePlayers, room.game?.dealerSeat),
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start a new hand.");
    }
  }

  async function handleCopyRoomCode() {
    if (!room) {
      return;
    }

    try {
      await navigator.clipboard.writeText(room.id);
      setCopiedRoomCode(true);
      window.setTimeout(() => setCopiedRoomCode(false), 1600);
      setError("");
    } catch {
      setError("Could not copy room code.");
    }
  }

  async function handleLeaveGame() {
    if (localPlayerId) {
      await leaveOnlineRoom(roomId, localPlayerId);
    }
    router.push("/");
  }

  function handleRevealCards() {
    if (!room?.game || !localPlayerId || room.game.phase !== "complete") {
      return;
    }

    if (!room.game.hands[localPlayerId] || room.game.revealedPlayerIds.includes(localPlayerId)) {
      return;
    }

    updateRoom({
      ...room,
      game: {
        ...room.game,
        revealedPlayerIds: [...room.game.revealedPlayerIds, localPlayerId],
      },
    });
  }

  function selectChipAmount(nextAmount: number) {
    setChipStep(nextAmount);
    setAmount(nextAmount);
  }

  function changeAmount(direction: -1 | 1) {
    setAmount((currentAmount) => Math.max(game?.bigBlind ?? chipStep, currentAmount + chipStep * direction));
  }

  const isLocalTurn = Boolean(game?.turnPlayerId && game.turnPlayerId === localPlayerId);
  const isBotTurn = Boolean(turnPlayer?.isSimulated && game?.turnPlayerId);

  if (!room) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Game not found</h1>
          <p className="muted">Start from a local room lobby first.</p>
          <Link className="secondary-button inline-button" href="/">
            Back to start
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={`page-shell ${styles.gameScreen}`}>
      <section className="table-header">
        <div>
          <p className="eyebrow">Exile Poker</p>
          <button className={styles.roomCodeButton} type="button" onClick={handleCopyRoomCode}>
            Room {room.id}
            <span>{copiedRoomCode ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div className="header-actions">
          <button
            aria-label="Show winning hand order"
            className="secondary-button inline-button"
            type="button"
            onClick={() => setShowWinGuide(true)}
          >
            Guide
          </button>
          <button className="danger-button inline-button" type="button" onClick={handleLeaveGame}>
            Leave
          </button>
        </div>
      </section>

      {game ? (
        <>
          <div className="game-layout">
            <section className="table-felt" aria-label="Poker table">
            <div className="community-zone">
              <div className="table-status">
                <span className="round-label">{stage?.round}</span>
                <span className="pot-label">Pot {game.pot}</span>
              </div>
              <strong className="stage-label">{stage?.label}</strong>
              <CommunityCards cards={game.communityCards} />
              <p>{game.message}</p>
            </div>

            <div className="seats-grid">
                {tablePlayers.map((player, tableIndex) => {
                  const hand = game.hands[player.id];
                  const isTurn = player.id === game.turnPlayerId;
                  const isWinner = game.winnerIds.includes(player.id);
                  const isLocalPlayer = player.id === localPlayerId;
                  const isRevealedToTable = game.revealedPlayerIds.includes(player.id);
                  const shouldShowHoleCards =
                    isLocalPlayer || game.phase === "showdown" || isRevealedToTable;
                  const winningHandLabel = getWinningHandLabel(game, player.id);
                  const blindLabel = getBlindLabel(game, player.id);
                  const isAllIn = Boolean(hand && !hand.folded && (hand.allIn || player.chips <= 0));
                  return (
                    <article
                      className={`seat-card ${isTurn ? "is-turn" : ""} ${isWinner ? "is-winner" : ""} ${
                        isLocalPlayer ? "is-local-player" : `seat-position-${tableIndex + 1}`
                      }`}
                      key={player.id}
                    >
                      <div className="seat-header">
                        <div className="player-title">
                          <strong className="player-name">{isLocalPlayer ? `${player.name} (you)` : player.name} </strong>
                          {blindLabel ? <span className="blind-label">{blindLabel}</span> : null}
                        </div>
                        <span className="chip-count">{player.chips}$</span>
                      </div>
                      <div className="mini-cards">
                        {hand?.cards.map((card, index) => (
                          index * tablePlayers.length + tableIndex < dealtCardCount ? (
                            shouldShowHoleCards ? (
                              <PlayingCard
                                card={card}
                                compact
                                dealDelay={0}
                                key={`${dealAnimationKey}-${card.rank}-${card.suit}-${index}`}
                              />
                            ) : (
                              <span
                                aria-label="Hidden card"
                                className="card compact-card card-back dealt-card"
                                key={`${dealAnimationKey}-hidden-${player.id}-${index}`}
                              />
                            )
                          ) : (
                            <span
                              aria-hidden="true"
                              className="card compact-card card-placeholder"
                              key={`${dealAnimationKey}-pending-${player.id}-${index}`}
                            />
                          )
                        ))}
                      </div>
                      <span
                        className={`seat-status ${hand?.folded ? "is-folded" : ""} ${
                          winningHandLabel ? "has-winning-hand" : ""
                        }`}
                      >
                        <span>
                          {getSeatStatusLabel(
                            hand?.folded,
                            isAllIn,
                            hand?.betThisRound,
                            hand?.committed,
                          )}
                        </span>
                        {winningHandLabel ? <strong>{winningHandLabel}</strong> : null}
                      </span>
                    </article>
                );
              })}
            </div>
            </section>

            <section className="panel action-panel">
              <div className="action-summary">
                <h2>{turnPlayer ? `${turnPlayer.name}'s turn` : "Hand finished"}</h2>
              <p className="muted">
                {stage?.round} - {stage?.label} - Current bet {game.currentBet}
                {winners ? ` - Winner ${winners}` : ""}
              </p>
            </div>

            {isLocalTurn ? (
              <div className="action-controls">
                <ChipPicker amount={amount} chipStep={chipStep} onChange={selectChipAmount} onStep={changeAmount} />
                <ActionButtons
                  actions={getAvailableActions(game, localPlayerId)}
                  amount={amount}
                  onAction={handleAction}
                />
              </div>
            ) : game.turnPlayerId ? (
              <p className="muted bot-thinking">
                {isBotTurn ? `${turnPlayer?.name} is thinking...` : `Waiting for ${turnPlayer?.name ?? "player"}...`}
              </p>
            ) : (
              <div className={styles.handEndActions}>
                {game.phase === "complete" &&
                localPlayerId &&
                game.hands[localPlayerId] &&
                !game.revealedPlayerIds.includes(localPlayerId) ? (
                  <button className="secondary-button" type="button" onClick={handleRevealCards}>
                    Show my cards
                  </button>
                ) : null}
                <button className="primary-button" type="button" onClick={handleNewHand}>
                  New hand
                </button>
              </div>
            )}

            {error ? <p className="error-text">{error}</p> : null}
            </section>
          </div>

          {showWinGuide ? <WinOrderGuide onClose={() => setShowWinGuide(false)} /> : null}
        </>
      ) : (
        <section className="panel">
          <h2>No hand started</h2>
          <button className="primary-button" type="button" onClick={handleNewHand}>
            Start hand
          </button>
        </section>
      )}
    </main>
  );
}

const winOrder: { label: string; example: string[] }[] = [
  { label: "Royal flush", example: ["10♠", "J♠", "Q♠", "K♠", "A♠"] },
  { label: "Straight flush", example: ["5♥", "6♥", "7♥", "8♥", "9♥"] },
  { label: "Four of a kind", example: ["9♠", "9♥", "9♦", "9♣", "K♠"] },
  { label: "Full house", example: ["Q♠", "Q♥", "Q♦", "7♣", "7♠"] },
  { label: "Flush", example: ["2♥", "6♥", "9♥", "J♥", "K♥"] },
  { label: "Straight", example: ["5♣", "6♦", "7♠", "8♥", "9♣"] },
  { label: "Three of a kind", example: ["4♠", "4♥", "4♦", "J♣", "A♠"] },
  { label: "Two pair", example: ["8♠", "8♦", "K♥", "K♣", "3♠"] },
  { label: "Pair", example: ["A♠", "A♥", "5♦", "9♣", "J♠"] },
  { label: "High card", example: ["A♠", "J♥", "8♦", "6♣", "2♠"] },
];

const chipOptions = [10, 20, 50, 100, 500, 1000];

function getGameStage(phase: HandPhase): { round: string; label: string } {
  switch (phase) {
    case "preflop":
      return { round: "Round 1", label: "Pre-flop" };
    case "flop":
      return { round: "Round 2", label: "Flop" };
    case "turn":
      return { round: "Round 3", label: "Turn" };
    case "river":
      return { round: "Round 4", label: "River" };
    case "showdown":
      return { round: "Showdown", label: "Reveal cards" };
    case "complete":
      return { round: "Complete", label: "Hand complete" };
    case "lobby":
      return { round: "Lobby", label: "Waiting to start" };
  }
}

function getWinningHandLabel(game: Room["game"], playerId: string): string | null {
  if (!game?.winnerIds.includes(playerId)) {
    return null;
  }

  if (game.phase === "showdown") {
    const hand = game.hands[playerId];
    if (!hand) {
      return null;
    }
    return evaluateBestHand([...hand.cards, ...game.communityCards]).label;
  }

  if (game.phase === "complete") {
    return "Won by fold";
  }

  return null;
}

function getBlindLabel(game: Room["game"], playerId: string): string | null {
  if (!game) {
    return null;
  }

  if (game.bigBlindPlayerId === playerId) {
    return "Big blind";
  }

  if (game.smallBlindPlayerId === playerId) {
    return "Small blind";
  }

  return null;
}

function getSeatStatusLabel(
  folded: boolean | undefined,
  allIn: boolean,
  betThisRound: number | undefined,
  committed: number | undefined,
): string {
  if (folded) {
    return "Folded";
  }

  if (allIn) {
    return `ALL IN! ${committed ?? betThisRound ?? 0}`;
  }

  return `Bet ${betThisRound ?? 0}`;
}

function ChipPicker({
  amount,
  chipStep,
  onChange,
  onStep,
}: {
  amount: number;
  chipStep: number;
  onChange: (amount: number) => void;
  onStep: (direction: -1 | 1) => void;
}) {
  return (
    <div className="chip-picker" aria-label="Bet or raise amount">
      <div className="chip-stepper">
        <button aria-label="Decrease bet amount" className="chip-step-button" type="button" onClick={() => onStep(-1)}>
          -
        </button>
        <strong>{amount}</strong>
        <button aria-label="Increase bet amount" className="chip-step-button" type="button" onClick={() => onStep(1)}>
          +
        </button>
      </div>
      <div className="chip-options">
        {chipOptions.map((chipAmount) => (
          <button
            className={`chip-option ${chipStep === chipAmount ? "is-selected" : ""}`}
            key={chipAmount}
            type="button"
            onClick={() => onChange(chipAmount)}
          >
            {chipAmount}
          </button>
        ))}
      </div>
    </div>
  );
}

function WinOrderGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Winning hand order"
        aria-modal="true"
        className="panel win-order-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>Win order</h2>
          <button aria-label="Close winning hand order" className="icon-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <ol>
          {winOrder.map((hand) => (
            <li key={hand.label}>
              <span>{hand.label}</span>
              <div className="guide-card-row" aria-hidden="true">
                {hand.example.map((card) => (
                  <span className={card.includes("♥") || card.includes("♦") ? "guide-card red-card" : "guide-card"} key={card}>
                    {card}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function CommunityCards({ cards }: { cards: Card[] }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const revealedCountRef = useRef(0);

  useEffect(() => {
    revealedCountRef.current = revealedCount;
  }, [revealedCount]);

  useEffect(() => {
    const currentCount = revealedCountRef.current;

    if (cards.length === 0) {
      setRevealedCount(0);
      return;
    }

    if (cards.length < currentCount) {
      setRevealedCount(cards.length);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let index = currentCount; index < cards.length; index += 1) {
      timers.push(
        setTimeout(() => {
          setRevealedCount((count) => Math.max(count, index + 1));
        }, (index - currentCount) * 1000),
      );
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [cards.length]);

  return (
    <div className="cards-row">
      {Array.from({ length: 5 }).map((_, index) => {
        const card = cards[index];
        const isRevealed = Boolean(card) && index < revealedCount;
        return (
          <div
            className={`community-card-slot ${isRevealed ? "is-revealed" : ""}`}
            key={`community-slot-${index}`}
          >
            <div className="community-card-inner">
              <div
                className={`card community-card-face community-card-front ${
                  card && isRedSuit(card.suit) ? "red-card" : ""
                }`}
              >
                {card ? <span className="card-label">{cardLabel(card)}</span> : null}
              </div>
              <div className="card card-back community-card-face community-card-back" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionButtons({
  actions,
  amount,
  onAction,
}: {
  actions: string[];
  amount: number;
  onAction: (action: PokerAction) => void;
}) {
  return (
    <div className="actions-row">
      {actions.includes("check") ? (
        <button className="secondary-button" type="button" onClick={() => onAction({ type: "check" })}>
          Check
        </button>
      ) : null}
      {actions.includes("call") ? (
        <button className="secondary-button" type="button" onClick={() => onAction({ type: "call" })}>
          Call
        </button>
      ) : null}
      {actions.includes("bet") ? (
        <button className="primary-button" type="button" onClick={() => onAction({ type: "bet", amount })}>
          Bet
        </button>
      ) : null}
      {actions.includes("raise") ? (
        <button className="primary-button" type="button" onClick={() => onAction({ type: "raise", amount })}>
          Raise
        </button>
      ) : null}
      {actions.includes("fold") ? (
        <button className="danger-button" type="button" onClick={() => onAction({ type: "fold" })}>
          Fold
        </button>
      ) : null}
    </div>
  );
}

function PlayingCard({
  card,
  compact = false,
  dealDelay,
}: {
  card: Card;
  compact?: boolean;
  dealDelay?: number;
}) {
  return (
    <div
      className={`card ${compact ? "compact-card" : ""} ${dealDelay !== undefined ? "dealt-card" : ""} ${
        isRedSuit(card.suit) ? "red-card" : ""
      }`}
      style={dealDelay !== undefined ? ({ "--deal-delay": `${dealDelay}ms` } as CSSProperties) : undefined}
    >
      <span className="card-label">{cardLabel(card)}</span>
    </div>
  );
}
