"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { readRoom, saveRoom } from "../../../src/lib/local/session";
import { applyPokerAction, getAvailableActions } from "../../../src/lib/poker/actions";
import { cardLabel, isRedSuit } from "../../../src/lib/poker/cards";
import { createInitialGame } from "../../../src/lib/poker/gameState";
import type { Card, PokerAction, Room } from "../../../src/lib/poker/types";

export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const roomId = useMemo(() => params.roomId.toUpperCase(), [params.roomId]);
  const [room, setRoom] = useState<Room | null>(null);
  const [amount, setAmount] = useState(20);
  const [error, setError] = useState("");
  const [showWinGuide, setShowWinGuide] = useState(false);

  useEffect(() => {
    setRoom(readRoom(roomId));
  }, [roomId]);

  function updateRoom(nextRoom: Room) {
    saveRoom(nextRoom);
    setRoom(nextRoom);
  }

  function handleAction(action: PokerAction) {
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
  }

  function handleNewHand() {
    if (!room) {
      return;
    }
    updateRoom({ ...room, status: "playing", game: createInitialGame(room.players) });
  }

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

  const game = room.game;
  const turnPlayer = room.players.find((player) => player.id === game?.turnPlayerId);
  const winners = game?.winnerIds
    .map((winnerId) => room.players.find((player) => player.id === winnerId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <main className="page-shell game-screen">
      <section className="table-header">
        <div>
          <p className="eyebrow">Room {room.id}</p>
          <h1>Poker table</h1>
        </div>
        <Link className="secondary-button inline-button" href={`/room/${room.id}`}>
          Lobby
        </Link>
      </section>

      {game ? (
        <>
          <section className="table-felt" aria-label="Poker table">
            <button
              aria-label="Show winning hand order"
              className="help-button"
              type="button"
              onClick={() => setShowWinGuide(true)}
            >
              ?
            </button>

            <div className="community-zone">
              <span className="pot-label">Pot {game.pot}</span>
              <CommunityCards cards={game.communityCards} />
              <p>{game.message}</p>
            </div>

            <div className="seats-grid">
              {room.players.map((player) => {
                const hand = game.hands[player.id];
                const isTurn = player.id === game.turnPlayerId;
                const isWinner = game.winnerIds.includes(player.id);
                return (
                  <article
                    className={`seat-card ${isTurn ? "is-turn" : ""} ${isWinner ? "is-winner" : ""}`}
                    key={player.id}
                  >
                    <div>
                      <strong>{player.name}</strong>
                      <span>{player.chips} chips</span>
                    </div>
                    <div className="mini-cards">
                      {hand?.cards.map((card, index) => (
                        <PlayingCard card={card} compact key={`${card.rank}-${card.suit}-${index}`} />
                      ))}
                    </div>
                    <span>{hand?.folded ? "Folded" : `Bet ${hand?.betThisRound ?? 0}`}</span>
                  </article>
                );
              })}
            </div>
          </section>

          {showWinGuide ? <WinOrderGuide onClose={() => setShowWinGuide(false)} /> : null}

          <section className="panel action-panel">
            <div>
              <h2>{turnPlayer ? `${turnPlayer.name}'s turn` : "Hand finished"}</h2>
              <p className="muted">
                Phase {game.phase} · Current bet {game.currentBet}
                {winners ? ` · Winner ${winners}` : ""}
              </p>
            </div>

            {game.turnPlayerId ? (
              <div className="action-controls">
                <input
                  aria-label="Bet or raise amount"
                  min={game.bigBlind}
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
                <ActionButtons
                  actions={getAvailableActions(game, game.turnPlayerId)}
                  amount={amount}
                  onAction={handleAction}
                />
              </div>
            ) : (
              <button className="primary-button" type="button" onClick={handleNewHand}>
                New hand
              </button>
            )}

            {error ? <p className="error-text">{error}</p> : null}
          </section>
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
                {card ? cardLabel(card) : ""}
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

function PlayingCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <div className={`card ${compact ? "compact-card" : ""} ${isRedSuit(card.suit) ? "red-card" : ""}`}>
      {cardLabel(card)}
    </div>
  );
}
