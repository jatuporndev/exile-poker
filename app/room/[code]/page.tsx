"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addSimulatedPlayer, getOrCreateLocalPlayer, joinLocalRoom, saveRoom } from "../../../src/lib/local/session";
import { createInitialGame } from "../../../src/lib/poker/gameState";
import type { Room } from "../../../src/lib/poker/types";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = useMemo(() => params.code.toUpperCase(), [params.code]);
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const player = getOrCreateLocalPlayer();
    const joined = joinLocalRoom(code, player);
    if (!joined) {
      setMissing(true);
      return;
    }
    setRoom(joined);
  }, [code]);

  function handleAddSimulatedPlayer() {
    if (!room || room.players.length >= 6) {
      return;
    }
    setRoom(addSimulatedPlayer(room));
  }

  function handleStartGame() {
    if (!room || room.players.length < 2) {
      return;
    }

    const updated: Room = {
      ...room,
      status: "playing",
      game: createInitialGame(room.players),
    };
    saveRoom(updated);
    router.push(`/game/${updated.id}`);
  }

  if (missing) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Room not found</h1>
          <p className="muted">Local rooms only exist in the browser that created them.</p>
          <Link className="secondary-button inline-button" href="/">
            Back to start
          </Link>
        </section>
      </main>
    );
  }

  if (!room) {
    return <main className="page-shell">Loading room...</main>;
  }

  return (
    <main className="page-shell room-screen">
      <section className="table-header">
        <div>
          <p className="eyebrow">Lobby</p>
          <h1>Room {room.id}</h1>
        </div>
        <Link className="secondary-button inline-button" href="/">
          Exit
        </Link>
      </section>

      <section className="panel code-panel">
        <span>Invite code</span>
        <strong>{room.id}</strong>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Players</h2>
          <span>{room.players.length}/6</span>
        </div>

        <div className="player-list">
          {room.players.map((player) => (
            <div className="player-row" key={player.id}>
              <span className="seat-number">Seat {player.seat + 1}</span>
              <strong>{player.name}</strong>
              <span>{player.chips} chips</span>
            </div>
          ))}
        </div>
      </section>

      <section className="actions-row">
        <button
          className="secondary-button"
          type="button"
          onClick={handleAddSimulatedPlayer}
          disabled={room.players.length >= 6}
        >
          Add guest bot
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={handleStartGame}
          disabled={room.players.length < 2}
        >
          Start game
        </button>
      </section>
    </main>
  );
}
