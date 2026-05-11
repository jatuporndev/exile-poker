"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { Fragment, memo } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addOnlineSimulatedPlayer,
  joinOnlineRoom,
  leaveOnlineRoom,
  normalizeRoomCode,
  saveOnlineRoom,
  sendOnlineReaction,
  subscribeToOnlineRoom,
  trackRoomPresence,
} from "../../rooms/data/firebaseRooms";
import { applyPokerAction, getAvailableActions, settleGameProgress } from "../../poker/domain/actions";
import { chooseBotAction } from "../../poker/domain/bot";
import { cardLabel, isRedSuit } from "../../poker/domain/cards";
import { createInitialGame } from "../../poker/domain/gameState";
import { evaluateBestHand } from "../../poker/domain/handEvaluator";
import type { Card, HandPhase, PokerAction, Rank, Room, Suit } from "../../poker/domain/types";
import { getOrCreateLocalPlayer } from "../../../shared/local/playerSession";
import styles from "./GameTable.module.css";

const cardSkins = [
  { id: "classic", src: "/back-card.jpg" },
  { id: "violet", src: "/back-card-2.jpg" },
  { id: "table", src: "/back-card-3.jpg" },
] as const;

const homeCardSkinStorageKey = "exilepoker:home-card-skin";

type CardSkinId = (typeof cardSkins)[number]["id"];

export function GameTable({ roomId: rawRoomId }: { roomId: string }) {
  const router = useRouter();
  const roomId = useMemo(() => normalizeRoomCode(rawRoomId), [rawRoomId]);
  const [room, setRoom] = useState<Room | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [amount, setAmount] = useState(0);
  const [chipStep, setChipStep] = useState(10);
  const [error, setError] = useState("");
  const [showWinGuide, setShowWinGuide] = useState(false);
  const [localPlayerId, setLocalPlayerId] = useState("");
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [dealtCardCount, setDealtCardCount] = useState(0);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const [reactionClock, setReactionClock] = useState(Date.now());
  const [reactionWheelOpen, setReactionWheelOpen] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [cardSkinId, setCardSkinId] = useState<CardSkinId>("classic");
  const lastActionLogKeyRef = useRef("");
  const localPlayerSession = useMemo(() => getOrCreateLocalPlayer(), []);

  useEffect(() => {
    const savedSkin = localStorage.getItem(homeCardSkinStorageKey);
    if (cardSkins.some((skin) => skin.id === savedSkin)) {
      setCardSkinId(savedSkin as CardSkinId);
    }
  }, []);

  useEffect(() => {
    setLocalPlayerId(localPlayerSession.id);
    setRoomLoaded(false);
    return subscribeToOnlineRoom(roomId, (nextRoom) => {
      setRoom(nextRoom);
      setRoomLoaded(true);
    });
  }, [localPlayerSession.id, roomId]);

  useEffect(() => {
    let canceled = false;

    async function joinRoom() {
      try {
        const joinedRoom = await joinOnlineRoom(roomId, localPlayerSession);
        if (!canceled && joinedRoom) {
          setRoom(joinedRoom);
          setRoomLoaded(true);
          setError("");
        }
      } catch (caught) {
        if (!canceled) {
          setError(caught instanceof Error ? caught.message : "Could not join room.");
        }
      }
    }

    void joinRoom();

    return () => {
      canceled = true;
    };
  }, [localPlayerSession, roomId]);

  useEffect(() => {
    if (!localPlayerId) {
      return;
    }

    return trackRoomPresence(roomId, localPlayerId);
  }, [localPlayerId, roomId]);

  const game = room?.game ?? null;
  const players = useMemo(() => room?.players ?? [], [room?.players]);
  const visiblePlayers = useMemo(
    () => players.filter((player) => player.connected || player.isSimulated),
    [players],
  );
  const turnPlayer = useMemo(
    () => players.find((player) => player.id === game?.turnPlayerId),
    [game?.turnPlayerId, players],
  );
  const winners = useMemo(
    () =>
      game?.winnerIds
        .map((winnerId) => players.find((player) => player.id === winnerId)?.name)
        .filter(Boolean)
        .join(", "),
    [game?.winnerIds, players],
  );
  const localPlayer = useMemo(
    () => players.find((player) => player.id === localPlayerId),
    [localPlayerId, players],
  );
  const localHand = game && localPlayerId ? game.hands[localPlayerId] : undefined;
  const tablePlayers = useMemo(
    () =>
      room
        ? [
            ...visiblePlayers.filter((player) => player.id !== localPlayerId),
            ...(localPlayer ? [localPlayer] : []),
          ]
        : [],
    [localPlayer, localPlayerId, room, visiblePlayers],
  );
  const stage = useMemo(() => (game ? getGameStage(game.phase) : null), [game]);
  const dealAnimationKey = useMemo(
    () =>
      game
        ? Object.values(game.hands)
            .map((hand) => `${hand.playerId}:${hand.cards.map(cardLabel).join(",")}`)
            .join("|")
        : "",
    [game],
  );
  const totalHoleCards = tablePlayers.length * 2;
  const activeReactions = useMemo(
    () => room?.reactions.filter((reaction) => reactionClock - reaction.createdAt < reactionLifetimeMs) ?? [],
    [reactionClock, room?.reactions],
  );
  const latestReactionByPlayer = useMemo(() => {
    const reactions = new Map<string, Room["reactions"][number]>();
    for (const reaction of activeReactions) {
      const current = reactions.get(reaction.playerId);
      if (!current || reaction.createdAt > current.createdAt) {
        reactions.set(reaction.playerId, reaction);
      }
    }
    return reactions;
  }, [activeReactions]);

  useEffect(() => {
    if (!game?.message) {
      return;
    }

    const logKey = `${roomId}:${game.phase}:${game.pot}:${game.currentBet}:${game.turnPlayerId ?? "none"}:${game.message}`;
    if (lastActionLogKeyRef.current === logKey) {
      return;
    }

    lastActionLogKeyRef.current = logKey;
    setActionLog((entries) => [
      {
        id: `${Date.now()}-${entries.length}`,
        message: game.message,
        round: getGameStage(game.phase).label,
      },
      ...entries,
    ].slice(0, 12));
  }, [game?.currentBet, game?.message, game?.phase, game?.pot, game?.turnPlayerId, roomId]);

  useEffect(() => {
    if (activeReactions.length === 0) {
      return;
    }

    const nextExpiry = Math.min(
      ...activeReactions.map((reaction) => reaction.createdAt + reactionLifetimeMs),
    );
    const timer = window.setTimeout(
      () => setReactionClock(Date.now()),
      Math.max(0, nextExpiry - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [activeReactions]);

  useEffect(() => {
    if (!reactionWheelOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element) || event.target.closest(".seat-reaction-pack")) {
        return;
      }

      setReactionWheelOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setReactionWheelOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionWheelOpen]);

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

  async function handleAddSimulatedPlayer() {
    if (!room || visiblePlayers.length >= 6) {
      return;
    }

    try {
      setRoom(await addOnlineSimulatedPlayer(room));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add guest bot.");
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

  const handleReaction = useCallback(async (emoji: string) => {
    if (!localPlayerId) {
      return;
    }

    try {
      await sendOnlineReaction(roomId, { playerId: localPlayerId, emoji });
      setReactionClock(Date.now());
      setReactionWheelOpen(false);
      setError("");
    } catch {
      setError("Could not send reaction.");
    }
  }, [localPlayerId, roomId]);

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

  const selectChipAmount = useCallback((nextAmount: number) => {
    setAmount((currentAmount) => currentAmount + nextAmount);
    setChipStep(nextAmount);
  }, []);

  const changeAmount = useCallback((direction: -1 | 1) => {
    setAmount((currentAmount) => Math.max(0, currentAmount + chipStep * direction));
  }, [chipStep]);

  const toggleReactionWheel = useCallback(() => setReactionWheelOpen((open) => !open), []);
  const closeActionLog = useCallback(() => setActionLogOpen(false), []);
  const toggleActionLog = useCallback(() => setActionLogOpen((open) => !open), []);

  const isLocalTurn = Boolean(game?.turnPlayerId && game.turnPlayerId === localPlayerId);
  const isBotTurn = Boolean(turnPlayer?.isSimulated && game?.turnPlayerId);
  const selectedCardSkin =
    cardSkins.find((skin) => skin.id === cardSkinId) ?? cardSkins[0];
  const activePlayerCount = useMemo(
    () =>
      game
        ? visiblePlayers.filter((player) => {
            const hand = game.hands[player.id];
            return player.chips > 0 && !hand?.folded;
          }).length
        : visiblePlayers.length,
    [game, visiblePlayers],
  );
  const localAmountToCall = game && localHand ? Math.max(0, game.currentBet - localHand.betThisRound) : 0;
  const availableActions = useMemo(
    () => (game && localPlayerId ? getAvailableActions(game, localPlayerId) : []),
    [game, localPlayerId],
  );
  const turnTitle = isLocalTurn ? "Your move" : turnPlayer ? `${turnPlayer.name}'s turn` : "Hand finished";
  const turnDetail = isLocalTurn
    ? localAmountToCall > 0
      ? `Call ${localAmountToCall} to stay in`
      : "Check or set the pressure"
    : game?.turnPlayerId
      ? isBotTurn
        ? `${turnPlayer?.name} is thinking`
        : `Waiting for ${turnPlayer?.name ?? "player"}`
      : winners
        ? `Winner ${winners}`
        : "Ready for the next hand";

  if (!room) {
    if (!roomLoaded) {
      return <main className="page-shell">Loading table...</main>;
    }

    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Game not found</h1>
          <p className="muted">Check the invite code or create a new room.</p>
          <Link className="secondary-button inline-button" href="/">
            Back to start
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`page-shell ${styles.gameScreen}`}
      style={{ "--card-back-image": `url(${selectedCardSkin.src})` } as CSSProperties}
    >
      <section className="table-header">
        <div>
          <p className="eyebrow">Exile Poker</p>
          <button className={styles.roomCodeButton} type="button" onClick={handleCopyRoomCode}>
            Room {room.id}
            <span>{copiedRoomCode ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div className={styles.tableMetrics} aria-label="Table status">
          <span>
            <strong>{game ? stage?.label : "Lobby"}</strong>
            <span>Stage</span>
          </span>
          <span>
            <strong>{game ? game.currentBet : 0}</strong>
            <span>Current bet</span>
          </span>
          <span>
            <strong>{game ? game.pot : 0}</strong>
            <span>Pot</span>
          </span>
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
                <span className="pot-label">
                  Pot <AnimatedMoney value={game.pot} />
                </span>
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
                  const reaction = latestReactionByPlayer.get(player.id);
                  return (
                    <Fragment key={player.id}>
                      <article
                        className={`seat-card ${isTurn ? "is-turn" : ""} ${isWinner ? "is-winner" : ""} ${
                          isLocalPlayer ? "is-local-player" : `seat-position-${tableIndex + 1}`
                        }`}
                      >
                        <div className="seat-header">
                          <div className="player-title">
                            <strong className="player-name">{isLocalPlayer ? `${player.name} (you)` : player.name} </strong>
                            {blindLabel ? <span className="blind-label">{blindLabel}</span> : null}
                          </div>
                          <AnimatedMoney className="chip-count" prefix="$" value={player.chips} />
                        </div>
                        {reaction ? (
                          <span
                            aria-label={`${player.name} reacted with ${reaction.emoji}`}
                            className="reaction-bubble"
                            key={reaction.id}
                          >
                            {reaction.emoji}
                          </span>
                        ) : null}
                        <div className="mini-cards">
                          {hand?.cards.map((card, index) => (
                            index * tablePlayers.length + tableIndex < dealtCardCount ? (
                              shouldShowHoleCards ? (
                                <DealtPlayingCard
                                  card={card}
                                  compact
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
                          <SeatStatusLabel
                            allIn={isAllIn}
                            betThisRound={hand?.betThisRound}
                            committed={hand?.committed}
                            folded={hand?.folded}
                          />
                          {winningHandLabel ? <strong>{winningHandLabel}</strong> : null}
                        </span>
                      </article>
                      {isLocalPlayer ? (
                        <ReactionWheel
                          open={reactionWheelOpen}
                          onReaction={handleReaction}
                          onToggle={toggleReactionWheel}
                        />
                      ) : null}
                    </Fragment>
                );
              })}
            </div>
            </section>

            <section className="panel action-panel">
              <div className="action-summary">
                <p className={styles.actionKicker}>{turnDetail}</p>
                <h2>{turnTitle}</h2>
                <p className="muted action-meta">
                  <span aria-hidden="true" className="status-dot" />
                  <span>{stage?.round}</span>
                </p>
            </div>

            <div className="table-controls">
              {isLocalTurn ? (
                <div className="action-controls">
                  <ChipPicker amount={amount} chipStep={chipStep} onChange={selectChipAmount} onStep={changeAmount} />
                  <ActionButtons
                    actions={availableActions}
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
            </div>

            {error ? <p className="error-text">{error}</p> : null}
            </section>

            <ActionLog
              entries={actionLog}
              open={actionLogOpen}
              onClose={closeActionLog}
              onToggle={toggleActionLog}
            />
          </div>

          {showWinGuide ? <WinOrderGuide onClose={() => setShowWinGuide(false)} /> : null}
        </>
      ) : (
        <section className={`panel ${styles.waitingPanel}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Table ready</p>
              <h2>Waiting for a new hand</h2>
              <p className={styles.waitingCopy}>
                Share the room code, add guest bots if needed, then start when at least two seats are ready.
              </p>
            </div>
            <span>{visiblePlayers.length}/6</span>
          </div>

          <button className={styles.inviteCode} type="button" onClick={handleCopyRoomCode}>
            <span>Invite code</span>
            <strong>{room.id}</strong>
            <em>{copiedRoomCode ? "Copied" : "Copy"}</em>
          </button>

          <div className={styles.waitingPlayers}>
            {visiblePlayers.map((player) => (
              <div className={styles.waitingPlayer} key={player.id}>
                <span>Seat {player.seat + 1}</span>
                <strong>{player.id === localPlayerId ? `${player.name} (you)` : player.name}</strong>
                <span>{player.chips}$</span>
              </div>
            ))}
          </div>

          <div className="actions-row">
            <button
              className="secondary-button"
              type="button"
              onClick={handleAddSimulatedPlayer}
              disabled={visiblePlayers.length >= 6}
            >
              Add guest bot
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={handleNewHand}
              disabled={visiblePlayers.length < 2}
            >
              New hand
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      )}
    </main>
  );
}

type ActionLogEntry = {
  id: string;
  message: string;
  round: string;
};

const winOrder: { label: string; example: string[]; highlightCount: number }[] = [
  { label: "Royal flush", example: ["10♠", "J♠", "Q♠", "K♠", "A♠"], highlightCount: 5 },
  { label: "Straight flush", example: ["5♥", "6♥", "7♥", "8♥", "9♥"], highlightCount: 5 },
  { label: "Four of a kind", example: ["9♠", "9♥", "9♦", "9♣", "K♠"], highlightCount: 4 },
  { label: "Full house", example: ["Q♠", "Q♥", "Q♦", "7♣", "7♠"], highlightCount: 5 },
  { label: "Flush", example: ["2♥", "6♥", "9♥", "J♥", "K♥"], highlightCount: 5 },
  { label: "Straight", example: ["5♣", "6♦", "7♠", "8♥", "9♣"], highlightCount: 5 },
  { label: "Three of a kind", example: ["4♠", "4♥", "4♦", "J♣", "A♠"], highlightCount: 3 },
  { label: "Two pair", example: ["8♠", "8♦", "K♥", "K♣", "3♠"], highlightCount: 4 },
  { label: "Pair", example: ["A♠", "A♥", "5♦", "9♣", "J♠"], highlightCount: 2 },
  { label: "High card", example: ["A♠", "J♥", "8♦", "6♣", "2♠"], highlightCount: 1 },
];

const chipOptions = [10, 50, 100, 500, 1000];
const reactionLifetimeMs = 5000;
const reactionEmojis = ["\u{1F44D}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F525}", "\u{1F60E}", "\u{1F914}"];

const ActionLog = memo(function ActionLog({
  entries,
  open,
  onClose,
  onToggle,
}: {
  entries: ActionLogEntry[];
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Toggle local action log"
        className="action-log-toggle"
        type="button"
        onClick={onToggle}
      >
        Action log
      </button>
      {open ? (
        <aside className="action-log-panel" aria-label="Local action log">
          <div className="action-log-heading">
            <h2>Action log</h2>
            <div>
              <span>Local</span>
              <button aria-label="Close action log" className="action-log-close" type="button" onClick={onClose}>
                x
              </button>
            </div>
          </div>
          {entries.length > 0 ? (
            <ol>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.round}</span>
                  <strong>{entry.message}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No actions yet.</p>
          )}
        </aside>
      ) : null}
    </>
  );
});

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

const SeatStatusLabel = memo(function SeatStatusLabel({
  folded,
  allIn,
  betThisRound,
  committed,
}: {
  folded: boolean | undefined;
  allIn: boolean;
  betThisRound: number | undefined;
  committed: number | undefined;
}) {
  if (folded) {
    return <span>Folded</span>;
  }

  const amount = allIn ? (committed ?? betThisRound ?? 0) : (betThisRound ?? 0);

  if (allIn) {
    return (
      <span>
        ALL IN! {amount}
      </span>
    );
  }

  return (
    <span>
      Bet {amount}
    </span>
  );
});

const digitStripCharacters = "0123456789".split("");

const AnimatedMoney = memo(function AnimatedMoney({
  value,
  prefix = "",
  className,
}: {
  value: number;
  prefix?: string;
  className?: string;
}) {
  const characters = String(value).split("");
  const digitIndexByCharacterIndex = characters.map((character, index) =>
    /\d/.test(character) ? characters.slice(index + 1).filter((nextCharacter) => /\d/.test(nextCharacter)).length : -1,
  );

  return (
    <span className={`${className ? `${className} ` : ""}money-change`} aria-label={`${prefix}${value}`}>
      {prefix ? (
        <span className="money-symbol" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      {characters.map((character, index) =>
        /\d/.test(character) ? (
          <span
            className="money-digit"
            style={{ "--digit": Number(character) } as CSSProperties}
            aria-hidden="true"
            key={`digit-${digitIndexByCharacterIndex[index]}`}
          >
            <span className="money-digit-strip">
              {digitStripCharacters.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        ) : (
          <span aria-hidden="true" key={`${index}-${character}`}>
            {character}
          </span>
        ),
      )}
    </span>
  );
});

const ChipPicker = memo(function ChipPicker({
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
      <div className="chip-control-group">
        <div className="chip-stepper">
          <button aria-label="Decrease bet amount" className="chip-step-button" type="button" onClick={() => onStep(-1)}>
            -
          </button>
          <strong>{amount}</strong>
          <button aria-label="Increase bet amount" className="chip-step-button" type="button" onClick={() => onStep(1)}>
            +
          </button>
        </div>
      </div>
      <div className="chip-control-group chip-options-group">
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
    </div>
  );
});

const ReactionWheel = memo(function ReactionWheel({
  open,
  onReaction,
  onToggle,
}: {
  open: boolean;
  onReaction: (emoji: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className={`seat-reaction-pack ${open ? "is-open" : ""}`}>
      <button
        aria-expanded={open}
        aria-label="Open reaction wheel"
        className="reaction-wheel-toggle"
        type="button"
        onClick={onToggle}
      >
        {reactionEmojis[0]}
      </button>
      {open ? (
        <div className="reaction-picker" aria-label="Send reaction">
          {reactionEmojis.map((emoji, index) => (
            <button
              aria-label={`React with ${emoji}`}
              className="reaction-button"
              key={emoji}
              style={{ "--reaction-index": index } as CSSProperties}
              type="button"
              onClick={() => onReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

function guideCardFromLabel(label: string): Card {
  const rank = label.slice(0, -1) as Rank;
  const suitSymbol = label.slice(-1);
  const suitsBySymbol: Record<string, Suit> = {
    "\u2663": "clubs",
    "\u2666": "diamonds",
    "\u2665": "hearts",
    "\u2660": "spades",
  };

  return {
    rank,
    suit: suitsBySymbol[suitSymbol] ?? "spades",
  };
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
                {hand.example.map((card, index) => {
                  const guideCard = guideCardFromLabel(card);
                  return (
                    <span
                      className={`card guide-card ${isRedSuit(guideCard.suit) ? "red-card" : ""} ${
                        index >= hand.highlightCount ? "is-muted-example" : ""
                      }`}
                      key={card}
                    >
                      <CardFace card={guideCard} />
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const CommunityCards = memo(function CommunityCards({ cards }: { cards: Card[] }) {
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
                {card ? <CardFace card={card} /> : null}
              </div>
              <div className="card card-back community-card-face community-card-back" />
            </div>
          </div>
        );
      })}
    </div>
  );
});

const ActionButtons = memo(function ActionButtons({
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
        <button
          className="primary-button"
          type="button"
          onClick={() => onAction({ type: "bet", amount })}
          disabled={amount <= 0}
        >
          Bet
        </button>
      ) : null}
      {actions.includes("raise") ? (
        <button
          className="primary-button"
          type="button"
          onClick={() => onAction({ type: "raise", amount })}
          disabled={amount <= 0}
        >
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
});

const PlayingCard = memo(function PlayingCard({
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
      <CardFace card={card} />
    </div>
  );
});

const DealtPlayingCard = memo(function DealtPlayingCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 720);
    return () => window.clearTimeout(timer);
  }, []);

  if (!revealed) {
    return <span aria-label="Dealing card" className={`card ${compact ? "compact-card " : ""}card-back dealt-card`} />;
  }

  return <PlayingCard card={card} compact={compact} />;
});

const CardFace = memo(function CardFace({ card }: { card: Card }) {
  const suit = suitSymbol(card.suit);

  return (
    <>
      <span className="card-corner">
        <span>{card.rank}</span>
        <span>{suit}</span>
      </span>
      <span className="card-suit" aria-hidden="true">
        {suit}
      </span>
      <span className="card-label">{cardLabel(card)}</span>
    </>
  );
});

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case "clubs":
      return "♣";
    case "diamonds":
      return "♦";
    case "hearts":
      return "♥";
    case "spades":
      return "♠";
  }
}
