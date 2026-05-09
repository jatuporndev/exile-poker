"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addOnlineSimulatedPlayer,
  joinOnlineRoom,
  normalizeRoomCode,
  saveOnlineRoom,
  subscribeToOnlineRoom,
} from "../data/firebaseRooms";
import { createInitialGame } from "../../poker/domain/gameState";
import type { Room } from "../../poker/domain/types";
import { getOrCreateLocalPlayer } from "../../../shared/local/playerSession";
import styles from "./RoomLobby.module.css";

export function RoomLobby({ code: rawCode }: { code: string }) {
  const router = useRouter();
  const code = useMemo(() => normalizeRoomCode(rawCode), [rawCode]);
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let canceled = false;
    let roomSeen = false;
    let joinedOnce = false;
    const missingTimer = setTimeout(() => {
      if (!canceled && !roomSeen) {
        setMissing(true);
      }
    }, 4000);

    async function joinRoom() {
      if (joinedOnce) {
        return;
      }

      try {
        const player = getOrCreateLocalPlayer();
        const joined = await joinOnlineRoom(code, player);
        if (canceled) {
          return;
        }
        if (!joined) {
          return;
        }
        roomSeen = true;
        joinedOnce = true;
        clearTimeout(missingTimer);
        setMissing(false);
        setRoom(joined);
      } catch (caught) {
        if (!canceled) {
          setError(caught instanceof Error ? caught.message : "Could not join room.");
        }
      }
    }

    setMissing(false);
    setError("");
    unsubscribe = subscribeToOnlineRoom(code, (nextRoom) => {
      if (!nextRoom) {
        return;
      }

      roomSeen = true;
      clearTimeout(missingTimer);
      setMissing(false);
      setRoom(nextRoom);
      void joinRoom();
    });
    void joinRoom();

    return () => {
      canceled = true;
      clearTimeout(missingTimer);
      unsubscribe?.();
    };
  }, [code]);

  useEffect(() => {
    if (room?.status === "playing" && room.game) {
      router.push(`/game/${room.id}`);
    }
  }, [room, router]);

  async function handleAddSimulatedPlayer() {
    if (!room || room.players.length >= 6) {
      return;
    }
    try {
      setRoom(await addOnlineSimulatedPlayer(room));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add guest bot.");
    }
  }

  async function handleStartGame() {
    if (!room || room.players.length < 2) {
      return;
    }

    try {
      const updated: Room = {
        ...room,
        status: "playing",
        game: createInitialGame(room.players),
      };
      await saveOnlineRoom(updated);
      router.push(`/game/${updated.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start game.");
    }
  }

  if (missing) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Room not found</h1>
          <p className="muted">Check the invite code or create a new room.</p>
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
    <main className={`page-shell ${styles.roomScreen}`}>
      <section className="table-header">
        <div>
          <p className="eyebrow">Lobby</p>
          <h1>Room {room.id}</h1>
        </div>
        <Link className="secondary-button inline-button" href="/">
          Exit
        </Link>
      </section>

      <section className={`panel ${styles.codePanel}`}>
        <span>Invite code</span>
        <strong>{room.id}</strong>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Players</h2>
          <span>{room.players.length}/6</span>
        </div>

        <div className={styles.playerList}>
          {room.players.map((player) => (
            <div className={styles.playerRow} key={player.id}>
              <span className={styles.seatNumber}>Seat {player.seat + 1}</span>
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
      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}
