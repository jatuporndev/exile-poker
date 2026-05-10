"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnlineRoom, normalizeRoomCode } from "../../rooms/data/firebaseRooms";
import {
  getOrCreateLocalPlayer,
  updateLocalPlayerName,
} from "../../../shared/local/playerSession";
import changeLogGroups from "../changelog.json";
import styles from "./StartScreen.module.css";

const cardSkins = [
  { id: "classic", label: "Classic", src: "/back-card.jpg" },
  { id: "violet", label: "Violet", src: "/back-card-2.jpg" },
] as const;

const homeCardSkinStorageKey = "exilepoker:home-card-skin";

type CardSkinId = (typeof cardSkins)[number]["id"];

export function StartScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [cardSkinId, setCardSkinId] = useState<CardSkinId>("classic");

  useEffect(() => {
    const player = getOrCreateLocalPlayer();
    setName(player.name);

    const savedSkin = localStorage.getItem(homeCardSkinStorageKey);
    if (cardSkins.some((skin) => skin.id === savedSkin)) {
      setCardSkinId(savedSkin as CardSkinId);
    }
  }, []);

  const selectedCardSkin =
    cardSkins.find((skin) => skin.id === cardSkinId) ?? cardSkins[0];

  async function handleCreateRoom() {
    setBusy(true);
    setError("");
    const player = updateLocalPlayerName(name);
    try {
      const room = await createOnlineRoom(player);
      router.push(`/game/${room.id}`);
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

    router.push(`/game/${code}`);
  }

  function handleCardSkinChange(nextSkinId: CardSkinId) {
    setCardSkinId(nextSkinId);
    localStorage.setItem(homeCardSkinStorageKey, nextSkinId);
  }

  return (
    <main className={`page-shell ${styles.startScreen}`}>
      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className="eyebrow">Private Texas Hold&apos;em</p>
          <h1 id="page-title">Exile Poker</h1>
          <p className={styles.summary}>
            Deal a private table, send the invite code, fill empty seats with
            guest bots.
          </p>
          <div className={styles.heroStats} aria-label="Game features">
            <span>2-6 seats</span>
            <span>Online rooms</span>
            <span>Guest bots</span>
          </div>
        </div>

        <div className={styles.cardShowcase}>
          <div className={styles.bigCard}>
            <span
              className={styles.cardBackFace}
              style={{ "--card-back-image": `url(${selectedCardSkin.src})` } as CSSProperties}
            />
            <span className={styles.cardFrontFace}>
              <span className={styles.homeCardCorner}>
                <span>2</span>
                <span>{"\u2665"}</span>
              </span>
              <span className={styles.homeCardSuit}>{"\u2665"}</span>
            </span>
          </div>
        </div>
      </section>

      <section className={`panel ${styles.startPanel}`} aria-label="Start controls">
        <div className={styles.skinPicker} aria-label="Card back skin">
          {cardSkins.map((skin) => (
            <button
              aria-pressed={skin.id === cardSkinId}
              className={skin.id === cardSkinId ? styles.skinOptionSelected : styles.skinOption}
              key={skin.id}
              onClick={() => handleCardSkinChange(skin.id)}
              style={{ "--skin-image": `url(${skin.src})` } as CSSProperties}
              type="button"
            >
              <span />
            </button>
          ))}
        </div>

        <div className={styles.panelHeading}>
          <div>
            <p className="eyebrow">Start table</p>
            <h2>Choose your seat</h2>
          </div>
        </div>

        <div className={styles.playerGroup}>
          <div>
            <h3>Your player</h3>
            <p>Name shown at the table.</p>
          </div>
          <label className="field">
            <span>Display name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>

        <div className={styles.roomGroup}>
          <div className={styles.groupHeading}>
            <h3>Table access</h3>
            <p>Create a new room or enter an invite code.</p>
          </div>

          <div className={styles.primaryAction}>
            <button className="primary-button" type="button" onClick={handleCreateRoom} disabled={busy}>
              Create room
            </button>
          </div>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <form className={styles.joinForm} onSubmit={handleJoinRoom}>
            <label className="field">
              <span>Invite code</span>
              <div className={styles.joinCodeRow}>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
                  placeholder="ABC123"
                />
                <button className="secondary-button" type="submit" disabled={busy}>
                  Join
                </button>
              </div>
            </label>
          </form>
        </div>

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
            X
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
