"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  addBlackjackSimulatedPlayer,
  joinBlackjackRoom,
  leaveBlackjackRoom,
  normalizeBlackjackRoomCode,
  saveBlackjackRoom,
  subscribeToBlackjackRoom,
  trackBlackjackRoomPresence,
} from "../data/firebaseBlackjackRooms";
import { applyBlackjackAction } from "../domain/actions";
import { chooseBlackjackBotAction } from "../domain/bot";
import { blackjackSuitSymbol, isRedSuit } from "../domain/cards";
import {
  blackjackMaxPlayers,
  createInitialBlackjackGame,
  getSeatedPlayers,
  minBet,
} from "../domain/gameState";
import { canDouble, handValue, isBlackjack, rankValue } from "../domain/rules";
import type {
  BlackjackAction,
  BlackjackCard,
  BlackjackHand,
  BlackjackPlayer,
  BlackjackRoom,
} from "../domain/types";
import type { CardSkin } from "../../../shared/cardSkins";
import { getOrCreateLocalPlayer } from "../../../shared/local/playerSession";
import styles from "./BlackjackTable.module.css";

const betChips = [10, 25, 50, 100];

/** Same key the home page writes when picking a card-back skin. */
const homeCardSkinStorageKey = "exilepoker:home-card-skin";

/**
 * The table is laid out once at this fixed design width, then the whole stage
 * is scaled uniformly to fit the screen — like a game canvas — so a shorter
 * laptop screen sees the entire table without scrolling. Below the mobile
 * breakpoint it falls back to the responsive flow instead.
 */
const stageDesignWidth = 1080;
const stageMinWidth = 760;

export function BlackjackTable({
  cardSkins = [],
  roomId: rawRoomId,
}: {
  cardSkins?: CardSkin[];
  roomId: string;
}) {
  const roomId = useMemo(() => normalizeBlackjackRoomCode(rawRoomId), [rawRoomId]);
  const [room, setRoom] = useState<BlackjackRoom | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [cardSkinId, setCardSkinId] = useState(cardSkins[0]?.id ?? "");
  // fixed = scale the whole stage to fit (laptop/desktop); otherwise responsive.
  const [stage, setStage] = useState({ fixed: true, scale: 1 });
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const stageScalerRef = useRef<HTMLDivElement | null>(null);
  const localPlayer = useMemo(() => getOrCreateLocalPlayer(), []);
  const localPlayerId = localPlayer.id;

  useEffect(() => {
    setRoomLoaded(false);
    return subscribeToBlackjackRoom(roomId, (nextRoom) => {
      setRoom(nextRoom);
      setRoomLoaded(true);
    });
  }, [roomId]);

  useEffect(() => {
    let canceled = false;
    async function join() {
      try {
        const joined = await joinBlackjackRoom(roomId, localPlayer);
        if (!canceled && joined) {
          setRoom(joined);
          setRoomLoaded(true);
          setError("");
        }
      } catch (caught) {
        if (!canceled) {
          setError(caught instanceof Error ? caught.message : "Could not join room.");
        }
      }
    }
    void join();
    return () => {
      canceled = true;
    };
  }, [localPlayer, roomId]);

  useEffect(() => trackBlackjackRoomPresence(roomId, localPlayerId), [localPlayerId, roomId]);

  useEffect(() => {
    const savedSkin = localStorage.getItem(homeCardSkinStorageKey);
    if (cardSkins.some((skin) => skin.id === savedSkin)) {
      setCardSkinId(savedSkin ?? "");
    }
  }, [cardSkins]);

  const game = room?.game ?? null;
  const players = useMemo(() => room?.players ?? [], [room?.players]);
  const seated = useMemo(() => getSeatedPlayers(players), [players]);
  const isHost = room?.hostId === localPlayerId;
  const localHand = game?.hands[localPlayerId] ?? null;
  // Other seated players, in seat order, shown around the table.
  const opponents = useMemo(
    () => seated.filter((player) => player.id !== localPlayerId),
    [localPlayerId, seated],
  );
  const selectedCardSkin = cardSkins.find((skin) => skin.id === cardSkinId) ?? cardSkins[0];

  const updateRoom = useCallback((nextRoom: BlackjackRoom) => {
    void saveBlackjackRoom(nextRoom);
    setRoom(nextRoom);
  }, []);

  const handleAction = useCallback(
    (playerId: string, action: BlackjackAction) => {
      if (!room?.game) {
        return;
      }
      try {
        const nextGame = applyBlackjackAction(room.game, room.players, playerId, action);
        updateRoom({ ...room, game: nextGame, status: "playing" });
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Action failed.");
      }
    },
    [room, updateRoom],
  );

  // The host drives guest bots: betting for them and playing their turns.
  useEffect(() => {
    if (!isHost || !room?.game) {
      return;
    }
    const { game: state } = room;

    if (state.phase === "betting") {
      const bot = getSeatedPlayers(room.players).find(
        (player) => player.isSimulated && state.hands[player.id]?.bet === 0,
      );
      const action = bot ? chooseBlackjackBotAction(state, bot.id) : null;
      if (!bot || !action) {
        return;
      }
      const timer = setTimeout(() => handleAction(bot.id, action), 700);
      return () => clearTimeout(timer);
    }

    if (state.phase === "playing" && state.turnPlayerId) {
      const turnPlayer = room.players.find((player) => player.id === state.turnPlayerId);
      const action = turnPlayer?.isSimulated
        ? chooseBlackjackBotAction(state, turnPlayer.id)
        : null;
      if (!turnPlayer?.isSimulated || !action) {
        return;
      }
      const timer = setTimeout(() => handleAction(turnPlayer.id, action), 950);
      return () => clearTimeout(timer);
    }
  }, [handleAction, isHost, room]);

  // Scale the whole table to fit the screen so a laptop never has to scroll.
  // Measures the stage's natural (pre-transform) size and shrinks it to fit.
  const inGame = room?.status !== "lobby" && Boolean(game);
  useLayoutEffect(() => {
    function updateStage() {
      if (window.innerWidth < stageMinWidth) {
        setStage({ fixed: false, scale: 1 });
        return;
      }
      const viewport = stageViewportRef.current;
      const scaler = stageScalerRef.current;
      if (!viewport || !scaler) {
        setStage({ fixed: true, scale: 1 });
        return;
      }
      // offsetWidth/Height are layout sizes, unaffected by the transform, so
      // reading them while scaled can't feed back into the calculation.
      const scale = Math.min(
        1,
        viewport.clientWidth / scaler.offsetWidth,
        viewport.clientHeight / scaler.offsetHeight,
      );
      setStage({ fixed: true, scale });
    }

    updateStage();
    window.addEventListener("resize", updateStage);
    const observer = new ResizeObserver(updateStage);
    if (stageScalerRef.current) {
      observer.observe(stageScalerRef.current);
    }
    if (stageViewportRef.current) {
      observer.observe(stageViewportRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateStage);
      observer.disconnect();
    };
  }, [inGame, game?.phase, opponents.length]);

  function handleStartGame() {
    if (!room) {
      return;
    }
    try {
      updateRoom({ ...room, status: "playing", game: createInitialBlackjackGame(room.players) });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the game.");
    }
  }

  async function handleAddGuest() {
    if (!room || room.players.length >= blackjackMaxPlayers) {
      return;
    }
    try {
      setRoom(await addBlackjackSimulatedPlayer(room));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add a guest bot.");
    }
  }

  async function handleCopyCode() {
    if (!room) {
      return;
    }
    try {
      await navigator.clipboard.writeText(room.id);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      setError("Could not copy room code.");
    }
  }

  async function handleLeave() {
    await leaveBlackjackRoom(roomId, localPlayerId);
  }

  if (!roomLoaded) {
    return (
      <main className={styles.viewport}>
        <p className={styles.loading}>Joining room…</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className={styles.viewport}>
        <div className={styles.missingRoom}>
          <h1>Room not found</h1>
          <p>The code {roomId} does not match any Blackjack room.</p>
          <Link className={styles.exitLink} href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const isMyTurn = game?.phase === "playing" && game.turnPlayerId === localPlayerId;
  const canBet = game?.phase === "betting" && localHand !== null && localHand.bet === 0;
  const turnName = game?.turnPlayerId
    ? players.find((player) => player.id === game.turnPlayerId)?.name
    : null;

  const stageContent = game ? (
    <section className={styles.stage} aria-label="Blackjack table">
      <span aria-hidden className={styles.feltLogo}>
        21
      </span>

      <DealerArea cards={game.dealer.cards} revealed={game.dealer.revealed} />

      <p className={styles.tableMessage} key={game.message}>
        {game.message}
      </p>

      {opponents.length > 0 ? (
        <div className={styles.opponents}>
          {opponents.map((player) => {
            const hand = game.hands[player.id];
            if (!hand) {
              return null;
            }
            return (
              <SeatView
                compact
                key={player.id}
                hand={hand}
                isTurn={game.phase === "playing" && game.turnPlayerId === player.id}
                player={player}
                revealed={game.dealer.revealed}
              />
            );
          })}
        </div>
      ) : null}

      {localHand ? (
        <SeatView
          hand={localHand}
          isLocal
          isTurn={isMyTurn}
          player={
            seated.find((player) => player.id === localPlayerId) ?? {
              id: localPlayerId,
              name: localPlayer.name,
              seat: 0,
              connected: true,
            }
          }
          revealed={game.dealer.revealed}
        />
      ) : null}

      <div className={styles.actionBar}>
        {canBet && localHand ? (
          <BettingControls
            bankroll={localHand.bankroll}
            onBet={(amount) => handleAction(localPlayerId, { type: "bet", amount })}
          />
        ) : null}

        {isMyTurn && localHand ? (
          <div className={styles.actionButtons}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => handleAction(localPlayerId, { type: "hit" })}
            >
              Hit
            </button>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => handleAction(localPlayerId, { type: "stand" })}
            >
              Stand
            </button>
            <button
              className={styles.actionButton}
              disabled={!canDouble(localHand)}
              type="button"
              onClick={() => handleAction(localPlayerId, { type: "double" })}
            >
              Double
            </button>
          </div>
        ) : null}

        {game.phase === "payout" ? (
          isHost ? (
            <button
              className={styles.primaryAction}
              type="button"
              onClick={() => handleAction(localPlayerId, { type: "next" })}
            >
              Deal next round
            </button>
          ) : (
            <p className={styles.waiting}>Waiting for the host to deal the next round…</p>
          )
        ) : null}

        {game.phase === "betting" && localHand && localHand.bet > 0 ? (
          <p className={styles.waiting}>Bet placed — waiting for the table…</p>
        ) : null}

        {game.phase === "playing" && !isMyTurn ? (
          <p className={styles.waiting}>
            {turnName ? `${turnName} is playing…` : "Dealer is acting…"}
          </p>
        ) : null}
      </div>
    </section>
  ) : null;

  return (
    <main
      className={styles.viewport}
      data-skinned={selectedCardSkin ? "" : undefined}
      style={
        selectedCardSkin
          ? ({ "--card-back-image": `url(${selectedCardSkin.src})` } as CSSProperties)
          : undefined
      }
    >
      <header className={styles.topBar}>
        <Link className={styles.exitLink} href="/" onClick={handleLeave}>
          ← Leave
        </Link>
        <span className={styles.logo}>
          Blackjack <em>Exile</em>
          {game ? <span className={styles.round}>Round {game.round}</span> : null}
        </span>
        <button className={styles.codeButton} type="button" onClick={handleCopyCode}>
          {copiedCode ? "Copied!" : `Code ${room.id}`}
        </button>
      </header>

      {room.status === "lobby" || !game ? (
        <LobbyView isHost={isHost} onAddGuest={handleAddGuest} onStart={handleStartGame} room={room} />
      ) : stage.fixed ? (
        <div className={styles.stageViewport} ref={stageViewportRef}>
          <div
            className={styles.stageScaler}
            ref={stageScalerRef}
            style={{ "--stage-scale": stage.scale } as CSSProperties}
          >
            {stageContent}
          </div>
        </div>
      ) : (
        stageContent
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}

function DealerArea({ cards, revealed }: { cards: BlackjackCard[]; revealed: boolean }) {
  // Before the reveal we only show the up-card's value, like a real table.
  const total = revealed
    ? handValue(cards).total
    : cards[0]
      ? rankValue(cards[0].rank)
      : null;

  return (
    <div className={styles.dealer}>
      <div className={styles.shoe} aria-hidden>
        <span className={styles.shoeCard} />
        <span className={styles.shoeCard} />
        <span className={styles.shoeCard} />
      </div>

      <div className={styles.dealerMain}>
        <span className={styles.dealerLabel}>
          Dealer
          {total !== null ? (
            <strong className={styles.totalBadge} key={`${total}-${revealed}`}>
              {revealed ? total : `${total}+`}
            </strong>
          ) : null}
        </span>
        <div className={styles.cardRow}>
          {cards.map((card, index) => {
            const isHole = index === 1;
            return (
              <PlayingCard
                card={card}
                dealIndex={index}
                // The hole card stays face down until the dealer reveals.
                faceDown={!revealed && isHole}
                // Remount the hole card on reveal so it plays the flip-open.
                key={isHole ? `${card.id}-${revealed}` : card.id}
                reveal={isHole && revealed}
              />
            );
          })}
          {cards.length === 0 ? <span className={styles.cardPlaceholder} /> : null}
        </div>
      </div>
    </div>
  );
}

function SeatView({
  compact,
  hand,
  isLocal,
  isTurn,
  player,
  revealed,
}: {
  compact?: boolean;
  hand: BlackjackHand;
  isLocal?: boolean;
  isTurn: boolean;
  player: BlackjackPlayer;
  revealed: boolean;
}) {
  const total = hand.cards.length > 0 ? handValue(hand.cards).total : null;
  const seatClass = [
    styles.seat,
    compact ? styles.seatCompact : styles.seatHero,
    isLocal ? styles.seatLocal : "",
    isTurn ? styles.seatActive : "",
    hand.status === "bust" ? styles.seatBust : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={seatClass}>
      <div className={styles.cardRow}>
        {hand.cards.map((card, index) => (
          <PlayingCard card={card} dealIndex={index} key={card.id} />
        ))}
        {hand.cards.length === 0 ? <span className={styles.cardPlaceholder} /> : null}
        {total !== null ? (
          <span className={styles.totalChip} key={total} data-soft={isBlackjack(hand.cards) || undefined}>
            {isBlackjack(hand.cards) ? "BJ" : total}
          </span>
        ) : null}
      </div>

      <div className={styles.seatPlate}>
        <span className={styles.avatar} aria-hidden>
          {(player.name.trim()[0] ?? "?").toUpperCase()}
        </span>
        <span className={styles.seatMeta}>
          <strong className={styles.seatName}>
            {player.name}
            {player.isSimulated ? <span className={styles.botTag}>bot</span> : null}
          </strong>
          <small className={styles.bankroll}>{hand.bankroll} chips</small>
        </span>
        {hand.bet > 0 ? <span className={styles.betChip} aria-label={`Bet ${hand.bet}`}>{hand.bet}</span> : null}
      </div>

      {revealed && hand.outcome ? (
        <span className={`${styles.outcome} ${styles[outcomeClass(hand.outcome)]}`}>
          {outcomeLabel(hand.outcome)}
        </span>
      ) : null}
    </div>
  );
}

function PlayingCard({
  card,
  dealIndex,
  faceDown,
  reveal,
}: {
  card: BlackjackCard;
  dealIndex: number;
  faceDown?: boolean;
  /** True for the hole card the moment it flips face up. */
  reveal?: boolean;
}) {
  const style = { "--deal-index": dealIndex } as CSSProperties;

  // A face-down card just drops in as the skinned back (no face reveal).
  if (faceDown) {
    return (
      <span
        className={`${styles.card} ${styles.cardBack} ${styles.dealt}`}
        aria-label="Face-down card"
        style={style}
      />
    );
  }

  const red = isRedSuit(card.suit);
  const symbol = blackjackSuitSymbol(card.suit);
  // `dealt` drops in face-down then flips up; `revealing` flips the hole card
  // up in place. Both keep the rank/suit hidden until the flip completes.
  const animClass = reveal ? styles.revealing : styles.dealt;
  return (
    <span
      className={`${styles.card} ${red ? styles.cardRed : styles.cardBlack} ${animClass}`}
      aria-label={`${card.rank} ${symbol}`}
      style={style}
    >
      <span className={styles.cardCorner}>
        <span>{card.rank}</span>
        <span>{symbol}</span>
      </span>
      <span className={styles.cardSuit} aria-hidden>
        {symbol}
      </span>
    </span>
  );
}

function BettingControls({
  bankroll,
  onBet,
}: {
  bankroll: number;
  onBet: (amount: number) => void;
}) {
  return (
    <div className={styles.betting}>
      <p className={styles.betPrompt}>Place your bet</p>
      <div className={styles.chipRow}>
        {betChips.map((amount, index) => (
          <button
            className={styles.chipButton}
            data-value={amount}
            disabled={amount > bankroll || amount < minBet}
            key={amount}
            style={{ "--chip-index": index } as CSSProperties}
            type="button"
            onClick={() => onBet(amount)}
          >
            {amount}
          </button>
        ))}
      </div>
    </div>
  );
}

function LobbyView({
  isHost,
  onAddGuest,
  onStart,
  room,
}: {
  isHost: boolean;
  onAddGuest: () => void;
  onStart: () => void;
  room: BlackjackRoom;
}) {
  return (
    <section className={styles.lobby} aria-label="Lobby">
      <h1 className={styles.lobbyTitle}>Table {room.id}</h1>
      <p className={styles.lobbySubtitle}>
        Share the code so friends can join. Add guest bots to fill empty seats.
      </p>

      <ul className={styles.playerList}>
        {room.players.map((player) => (
          <li className={styles.playerRow} key={player.id}>
            <span className={styles.avatar} aria-hidden>
              {(player.name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <span className={styles.playerName}>{player.name}</span>
            {player.isHost ? <span className={styles.hostTag}>host</span> : null}
            {player.isSimulated ? <span className={styles.botTag}>bot</span> : null}
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className={styles.lobbyActions}>
          <button
            className={styles.secondaryAction}
            disabled={room.players.length >= blackjackMaxPlayers}
            type="button"
            onClick={onAddGuest}
          >
            Add guest bot
          </button>
          <button className={styles.primaryAction} type="button" onClick={onStart}>
            Start game
          </button>
        </div>
      ) : (
        <p className={styles.waiting}>Waiting for the host to start…</p>
      )}

      <div className={styles.rulesCard}>
        <h2>House rules</h2>
        <ul>
          <li>Get closer to 21 than the dealer without going over.</li>
          <li>Dealer stands on all 17s. Naturals pay 3:2.</li>
          <li>Double down on your first two cards for one final card.</li>
        </ul>
      </div>
    </section>
  );
}

function outcomeLabel(outcome: NonNullable<BlackjackHand["outcome"]>): string {
  switch (outcome) {
    case "blackjack":
      return "Blackjack 3:2";
    case "win":
      return "Win";
    case "push":
      return "Push";
    case "bust":
      return "Bust";
    case "lose":
    default:
      return "Lose";
  }
}

function outcomeClass(
  outcome: NonNullable<BlackjackHand["outcome"]>,
): "outcomeWin" | "outcomePush" | "outcomeLose" {
  if (outcome === "win" || outcome === "blackjack") {
    return "outcomeWin";
  }
  if (outcome === "push") {
    return "outcomePush";
  }
  return "outcomeLose";
}
