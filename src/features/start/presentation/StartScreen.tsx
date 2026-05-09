"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnlineRoom, normalizeRoomCode } from "../../rooms/data/firebaseRooms";
import {
  getOrCreateLocalPlayer,
  updateLocalPlayerName,
} from "../../../shared/local/playerSession";
import changeLogGroups from "../changelog.json";
import styles from "./StartScreen.module.css";

export function StartScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChangeLog, setShowChangeLog] = useState(false);

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
    <main className={`page-shell ${styles.startScreen}`}>
      <section className={styles.hero} aria-labelledby="page-title">
        <p className="eyebrow">Exile Poker</p>
        <h1 id="page-title">Deal a table in seconds.</h1>
        <p className={styles.summary}>
          Create an online room, share the invite code, add guest bots, and play
          a live Texas Hold&apos;em hand with friends.
        </p>
        <div className={styles.heroStats} aria-label="Game features">
          <span>2-6 seats</span>
          <span>Online rooms</span>
          <span>Texas Hold&apos;em</span>
        </div>
      </section>

      <section className={`panel ${styles.startPanel}`} aria-label="Start controls">
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

        <form className={styles.joinForm} onSubmit={handleJoinRoom}>
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

      <button
        className={styles.changeLogTrigger}
        type="button"
        onClick={() => setShowChangeLog(true)}
      >
        Changelog
      </button>

      {showChangeLog ? <ChangeLogModal onClose={() => setShowChangeLog(false)} /> : null}
    </main>
  );
}

function ChangeLogModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        aria-label="Changelog"
        aria-modal="true"
        className={`panel ${styles.changeLogModal}`}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeading}>
          <div>
            <p className="eyebrow">Changelog</p>
            <h2>Latest updates</h2>
          </div>
          <button aria-label="Close changelog" className="icon-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {changeLogGroups.map((group) => (
          <div className={styles.changeGroup} key={group.date}>
            <time dateTime={group.date}>{group.label}</time>
            {group.tags.map((tag) => (
              <section className={styles.tagGroup} key={`${group.date}-${tag.type}`}>
                <span className={tag.type === "hotfix" ? styles.hotfixTag : styles.featureTag}>
                  {tag.type}
                </span>
                <ul className={styles.changeLogList}>
                  {tag.items.map((item) => (
                    <li key={`${group.date}-${tag.type}-${item.title}`}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
