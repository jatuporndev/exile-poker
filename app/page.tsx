"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLocalRoom,
  getOrCreateLocalPlayer,
  joinLocalRoom,
  updateLocalPlayerName,
} from "../src/lib/local/session";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const player = getOrCreateLocalPlayer();
    setName(player.name);
  }, []);

  function handleCreateRoom() {
    const player = updateLocalPlayerName(name);
    const room = createLocalRoom(player);
    router.push(`/room/${room.id}`);
  }

  function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const player = updateLocalPlayerName(name);
    const room = joinLocalRoom(joinCode, player);

    if (!room) {
      setError("Room code was not found in this browser.");
      return;
    }

    router.push(`/room/${room.id}`);
  }

  return (
    <main className="page-shell start-screen">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Exile Poker</p>
        <h1 id="page-title">Local table</h1>
        <p className="summary">
          Create a room, add simulated friends, and play a full local hand before
          Firebase multiplayer is connected.
        </p>
      </section>

      <section className="panel start-panel" aria-label="Start controls">
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <button className="primary-button" type="button" onClick={handleCreateRoom}>
          Create room
        </button>

        <form className="join-form" onSubmit={handleJoinRoom}>
          <label className="field">
            <span>Invite code</span>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
            />
          </label>
          <button className="secondary-button" type="submit">
            Join room
          </button>
        </form>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
