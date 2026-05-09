"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getOrCreateLocalPlayer,
  updateLocalPlayerName,
} from "../src/lib/local/session";
import { createOnlineRoom, normalizeRoomCode } from "../src/lib/firebase/rooms";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const player = getOrCreateLocalPlayer();
    setName(player.name);
  }, []);

  async function handleCreateRoom() {
    setBusy(true);
    setError("");
    const player = updateLocalPlayerName(name);
    try {
      const room = await createOnlineRoom(player);
      router.push(`/room/${room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
      setBusy(false);
    }
  }

  function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    updateLocalPlayerName(name);

    const code = normalizeRoomCode(joinCode);
    if (!code) {
      setError("Enter a room code.");
      return;
    }

    router.push(`/room/${code}`);
  }

  return (
    <main className="page-shell start-screen">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Exile Poker</p>
        <h1 id="page-title">Deal a table in seconds.</h1>
        <p className="summary">
          Create an online room, share the invite code, add guest bots, and play
          a live Texas Hold&apos;em hand with friends.
        </p>
        <div className="hero-stats" aria-label="Game features">
          <span>2-6 seats</span>
          <span>Online rooms</span>
          <span>Texas Hold&apos;em</span>
        </div>
      </section>

      <section className="panel start-panel" aria-label="Start controls">
        <div>
          <p className="eyebrow">Start table</p>
          <h2>Set your seat</h2>
        </div>

        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <button className="primary-button" type="button" onClick={handleCreateRoom} disabled={busy}>
          Create room
        </button>

        <form className="join-form" onSubmit={handleJoinRoom}>
          <label className="field">
            <span>Invite code</span>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
              placeholder="ABC123"
            />
          </label>
          <button className="secondary-button" type="submit" disabled={busy}>
            Join room
          </button>
        </form>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
