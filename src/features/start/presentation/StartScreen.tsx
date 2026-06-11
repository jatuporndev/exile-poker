"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOnlineRoom,
  normalizeRoomCode,
  onlineRoomExists,
} from "../../rooms/data/firebaseRooms";
import { createUnoRoom, unoRoomExists } from "../../../games/uno/data/firebaseUnoRooms";
import {
  getOrCreateLocalPlayer,
  updateLocalPlayerName,
} from "../../../shared/local/playerSession";
import type { CardSkin } from "../../../shared/cardSkins";
import changeLogGroups from "../changelog.json";
import styles from "./StartScreen.module.css";

const homeCardSkinStorageKey = "exilepoker:home-card-skin";

type GameId = "poker" | "uno";

const gameOptions: {
  id: GameId;
  name: string;
  tagline: string;
  players: string;
}[] = [
  {
    id: "poker",
    name: "Exile Poker",
    tagline: "Private Texas Hold'em with guest bots",
    players: "2-6 players",
  },
  {
    id: "uno",
    name: "UNO Exile",
    tagline: "House rules: +2 and +4 cards stack",
    players: "2-8 players",
  },
];

export function StartScreen({ cardSkins }: { cardSkins: CardSkin[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [cardSkinId, setCardSkinId] = useState(cardSkins[0]?.id ?? "");
  const [selectedGame, setSelectedGame] = useState<GameId>("poker");

  useEffect(() => {
    const player = getOrCreateLocalPlayer();
    setName(player.name);

    const savedSkin = localStorage.getItem(homeCardSkinStorageKey);
    if (cardSkins.some((skin) => skin.id === savedSkin)) {
      setCardSkinId(savedSkin ?? "");
    }
  }, [cardSkins]);

  const selectedCardSkin =
    cardSkins.find((skin) => skin.id === cardSkinId) ?? cardSkins[0];
  const selectedGameOption =
    gameOptions.find((game) => game.id === selectedGame) ?? gameOptions[0];

  async function handleCreateRoom() {
    setBusy(true);
    setError("");
    const player = updateLocalPlayerName(name);
    try {
      if (selectedGame === "uno") {
        const room = await createUnoRoom(player);
        router.push(`/uno/${room.id}`);
        return;
      }

      const room = await createOnlineRoom(player);
      router.push(`/game/${room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
      setBusy(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    updateLocalPlayerName(name);

    const code = normalizeRoomCode(joinCode);
    if (!code) {
      setError("Enter a room code.");
      return;
    }

    setBusy(true);
    try {
      // The code alone decides the game: look it up in every game's rooms.
      const [pokerRoom, unoRoom] = await Promise.all([
        onlineRoomExists(code),
        unoRoomExists(code),
      ]);

      if (pokerRoom) {
        router.push(`/game/${code}`);
        return;
      }
      if (unoRoom) {
        router.push(`/uno/${code}`);
        return;
      }

      setError("No room found with that code.");
      setBusy(false);
    } catch {
      setError("Could not look up that code. Try again.");
      setBusy(false);
    }
  }

  function handleCardSkinChange(nextSkinId: string) {
    setCardSkinId(nextSkinId);
    localStorage.setItem(homeCardSkinStorageKey, nextSkinId);
  }

  return (
    <main className={`page-shell ${styles.startScreen}`}>
      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className="eyebrow">Private card rooms</p>
          <h1 id="page-title">Exile Games</h1>
          <p className={styles.summary}>
            Pick a game, deal a private table, and send friends the invite
            code. Texas Hold&apos;em or stacking-rules UNO — one code is all
            they need to join.
          </p>
          <div className={styles.heroStats} aria-label="Game features">
            <span>2 games</span>
            <span>Online rooms</span>
            <span>Guest bots</span>
          </div>
        </div>

        <div className={styles.cardShowcase}>
          <div className={styles.bigCard} role="presentation">
            <span
              className={styles.cardBackFace}
              style={
                selectedCardSkin
                  ? ({ "--card-back-image": `url(${selectedCardSkin.src})` } as CSSProperties)
                  : undefined
              }
            />
            <span className={styles.cardFrontFace}>
              <span className={styles.homeCardCorner}>
                <span>2</span>
                <span>{"♥"}</span>
              </span>
              <span className={styles.homeCardSuit}>{"♥"}</span>
            </span>
          </div>

          <CardSkinPicker
            cardSkinId={cardSkinId}
            cardSkins={cardSkins}
            className={styles.mobileSkinPicker}
            onSkinChange={handleCardSkinChange}
          />
        </div>
      </section>

      <section className={`panel ${styles.startPanel}`} aria-label="Start controls">
        <CardSkinPicker
          cardSkinId={cardSkinId}
          cardSkins={cardSkins}
          className={styles.desktopSkinPicker}
          onSkinChange={handleCardSkinChange}
        />

        <div className={styles.panelHeading}>
          <div>
            <p className="eyebrow">Start playing</p>
            <h2>Pick your table</h2>
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
            <h3>Create a game</h3>
            <p>Choose what to play, then share the room code.</p>
          </div>

          <div className={styles.gamePicker} role="radiogroup" aria-label="Choose a game">
            {gameOptions.map((game) => (
              <button
                aria-checked={game.id === selectedGame}
                className={game.id === selectedGame ? styles.gameOptionSelected : styles.gameOption}
                key={game.id}
                role="radio"
                type="button"
                onClick={() => setSelectedGame(game.id)}
              >
                <span className={styles.gameIcon} data-game={game.id} aria-hidden>
                  {game.id === "poker" ? "♠" : "U"}
                </span>
                <span className={styles.gameMeta}>
                  <strong>{game.name}</strong>
                  <small>{game.tagline}</small>
                </span>
                <span className={styles.gamePlayers}>{game.players}</span>
              </button>
            ))}
          </div>

          <div className={styles.primaryAction}>
            <button className="primary-button" type="button" onClick={handleCreateRoom} disabled={busy}>
              Create {selectedGameOption.name} room
            </button>
          </div>

          <div className={styles.divider}>
            <span>or join</span>
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
            <p className={styles.joinHint}>
              The code finds the right game by itself — poker or UNO.
            </p>
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

function CardSkinPicker({
  cardSkinId,
  cardSkins,
  className,
  onSkinChange,
}: {
  cardSkinId: string;
  cardSkins: CardSkin[];
  className: string;
  onSkinChange: (skinId: string) => void;
}) {
  if (cardSkins.length === 0) {
    return null;
  }

  return (
    <div className={`${styles.skinPicker} ${className}`} aria-label="Card back skin">
      {cardSkins.map((skin) => (
        <button
          aria-pressed={skin.id === cardSkinId}
          className={skin.id === cardSkinId ? styles.skinOptionSelected : styles.skinOption}
          key={skin.id}
          onClick={() => onSkinChange(skin.id)}
          style={{ "--skin-image": `url(${skin.src})` } as CSSProperties}
          type="button"
        >
          <span />
        </button>
      ))}
    </div>
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
