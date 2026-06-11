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
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  addUnoSimulatedPlayer,
  joinUnoRoom,
  leaveUnoRoom,
  normalizeUnoRoomCode,
  saveUnoRoom,
  subscribeToUnoRoom,
  trackUnoRoomPresence,
} from "../data/firebaseUnoRooms";
import { applyUnoAction } from "../domain/actions";
import { chooseUnoBotAction } from "../domain/bot";
import { unoCardLabel, unoColorLabel, unoValueLabel } from "../domain/cards";
import { createInitialUnoGame, unoMaxPlayers } from "../domain/gameState";
import { canPlayCard, mustStack, playableCards } from "../domain/rules";
import { unoColors } from "../domain/types";
import type { UnoAction, UnoCard, UnoColor, UnoRoom } from "../domain/types";
import type { CardSkin } from "../../../shared/cardSkins";
import { getOrCreateLocalPlayer } from "../../../shared/local/playerSession";
import styles from "./UnoTable.module.css";

const colorSortOrder: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };

/** Same key the home page writes when picking a card-back skin. */
const homeCardSkinStorageKey = "exilepoker:home-card-skin";

/** How far (px) a card must be dragged upward to count as playing it. */
const dragPlayThreshold = 70;

/** Deterministic per-card jitter so every client sees the same "messy" pile. */
function cardJitter(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const rand = (salt: number) => {
    const x = Math.sin(hash + salt * 374761393) * 43758.5453;
    return x - Math.floor(x);
  };
  const sign = rand(1) < 0.5 ? -1 : 1;
  return {
    rotation: sign * (4 + rand(2) * 8), // ±4–12 degrees
    x: (rand(3) * 2 - 1) * 7,
    y: (rand(4) * 2 - 1) * 6,
  };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function UnoTable({
  cardSkins = [],
  roomId: rawRoomId,
}: {
  cardSkins?: CardSkin[];
  roomId: string;
}) {
  const roomId = useMemo(() => normalizeUnoRoomCode(rawRoomId), [rawRoomId]);
  const [room, setRoom] = useState<UnoRoom | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [pendingWildId, setPendingWildId] = useState<string | null>(null);
  const [cardSkinId, setCardSkinId] = useState(cardSkins[0]?.id ?? "");
  const [splash, setSplash] = useState<{ id: number; text: string; tone: "uno" | "stack" } | null>(null);
  const [shaking, setShaking] = useState(false);
  const localPlayer = useMemo(() => getOrCreateLocalPlayer(), []);
  const localPlayerId = localPlayer.id;

  useEffect(() => {
    setRoomLoaded(false);
    return subscribeToUnoRoom(roomId, (nextRoom) => {
      setRoom(nextRoom);
      setRoomLoaded(true);
    });
  }, [roomId]);

  useEffect(() => {
    let canceled = false;

    async function join() {
      try {
        const joined = await joinUnoRoom(roomId, localPlayer);
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

  useEffect(() => trackUnoRoomPresence(roomId, localPlayerId), [localPlayerId, roomId]);

  useEffect(() => {
    const savedSkin = localStorage.getItem(homeCardSkinStorageKey);
    if (cardSkins.some((skin) => skin.id === savedSkin)) {
      setCardSkinId(savedSkin ?? "");
    }
  }, [cardSkins]);

  const game = room?.game ?? null;
  const players = useMemo(() => room?.players ?? [], [room?.players]);
  const isHost = room?.hostId === localPlayerId;
  const localHand = useMemo(() => {
    const hand = game?.hands[localPlayerId] ?? [];
    return [...hand].sort((left, right) => {
      const colorDiff = colorSortOrder[left.color] - colorSortOrder[right.color];
      return colorDiff !== 0 ? colorDiff : left.value.localeCompare(right.value, undefined, { numeric: true });
    });
  }, [game?.hands, localPlayerId]);
  const isMyTurn = game?.phase === "playing" && game.turnPlayerId === localPlayerId;
  const forcedToStack = Boolean(game && isMyTurn && mustStack(game, localHand));
  const hasPlayableCard = Boolean(game && playableCards(game, localHand).length > 0);
  const canDraw =
    isMyTurn &&
    !game?.drawnCardId &&
    (game && game.pendingDraw > 0 ? !forcedToStack : !hasPlayableCard);
  const winner = useMemo(
    () => players.find((player) => player.id === game?.winnerId),
    [game?.winnerId, players],
  );
  const opponents = useMemo(
    () => players.filter((player) => player.id !== localPlayerId),
    [localPlayerId, players],
  );

  // Remembers the last card the local player threw so it animates from the hand,
  // while cards played by everyone else drop in from the table side.
  const lastLocalPlayRef = useRef<string | null>(null);

  const updateRoom = useCallback((nextRoom: UnoRoom) => {
    void saveUnoRoom(nextRoom);
    setRoom(nextRoom);
  }, []);

  const handleAction = useCallback(
    (playerId: string, action: UnoAction) => {
      if (!room?.game) {
        return;
      }

      try {
        const nextGame = applyUnoAction(room.game, room.players, playerId, action);
        if (playerId === localPlayerId && action.type === "play") {
          lastLocalPlayRef.current = action.cardId;
        }
        updateRoom({
          ...room,
          game: nextGame,
          status: nextGame.phase === "finished" ? "finished" : "playing",
        });
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Action failed.");
      }
    },
    [localPlayerId, room, updateRoom],
  );

  // The host plays for guest bots and for disconnected players to keep the game moving.
  useEffect(() => {
    if (!room?.game || room.game.phase !== "playing" || !isHost) {
      return;
    }

    const turnPlayer = room.players.find((player) => player.id === room.game?.turnPlayerId);
    if (!turnPlayer || (!turnPlayer.isSimulated && turnPlayer.connected)) {
      return;
    }

    const timer = setTimeout(() => {
      if (!room.game || !room.game.turnPlayerId) {
        return;
      }
      handleAction(room.game.turnPlayerId, chooseUnoBotAction(room.game, room.game.turnPlayerId));
    }, turnPlayer.isSimulated ? 900 : 4000);

    return () => clearTimeout(timer);
  }, [handleAction, isHost, room]);

  // Watch for dramatic moments (stacked penalties, UNO calls) and flash them on screen.
  const prevEmphasisRef = useRef<{ pendingDraw: number; handLengths: Record<string, number> } | null>(null);
  useEffect(() => {
    const prev = prevEmphasisRef.current;
    prevEmphasisRef.current = game
      ? {
          pendingDraw: game.pendingDraw,
          handLengths: Object.fromEntries(
            Object.entries(game.hands).map(([id, hand]) => [id, hand.length]),
          ),
        }
      : null;

    if (!game || !prev || game.phase !== "playing") {
      return;
    }

    let next: { text: string; tone: "uno" | "stack" } | null = null;
    if (game.pendingDraw > prev.pendingDraw) {
      next = { text: `+${game.pendingDraw}!`, tone: "stack" };
      if (!prefersReducedMotion()) {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 500);
      }
    } else {
      const calledUno = players.some(
        (player) =>
          (game.hands[player.id]?.length ?? 0) === 1 && (prev.handLengths[player.id] ?? 0) > 1,
      );
      if (calledUno) {
        next = { text: "UNO!", tone: "uno" };
      }
    }

    if (next) {
      setSplash({ id: Date.now(), ...next });
      const timer = window.setTimeout(() => setSplash(null), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [game, players]);

  // FLIP: when the hand re-flows (card played/drawn/sorted), slide cards to their
  // new slots instead of teleporting; brand-new cards get dealt in from the deck.
  const handRef = useRef<HTMLDivElement | null>(null);
  const prevCardLeftRef = useRef<Map<string, number>>(new Map());
  const handIdsKey = localHand.map((card) => card.id).join("|");
  useLayoutEffect(() => {
    const container = handRef.current;
    const nextPositions = new Map<string, number>();
    if (container) {
      const animate = !prefersReducedMotion();
      const hadCards = prevCardLeftRef.current.size > 0;
      let dealDelay = 0;
      for (const element of Array.from(container.querySelectorAll<HTMLElement>("[data-card-id]"))) {
        const id = element.dataset.cardId ?? "";
        const left = element.getBoundingClientRect().left;
        nextPositions.set(id, left);
        if (!animate) {
          continue;
        }
        const prevLeft = prevCardLeftRef.current.get(id);
        if (prevLeft !== undefined) {
          const dx = prevLeft - left;
          if (Math.abs(dx) > 3) {
            element.animate(
              [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0px)" }],
              { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)", composite: "add" },
            );
          }
        } else if (hadCards) {
          element.animate(
            [
              { transform: "translateY(-130px) rotate(-12deg) scale(0.72)" },
              { transform: "translateY(10px) rotate(3deg) scale(1.04)", offset: 0.7 },
              { transform: "translateY(0px) rotate(0deg) scale(1)" },
            ],
            {
              duration: 460,
              delay: dealDelay,
              fill: "backwards",
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              composite: "add",
            },
          );
          dealDelay = Math.min(dealDelay + 60, 360);
        }
      }
    }
    prevCardLeftRef.current = nextPositions;
  }, [handIdsKey]);

  function handleStartGame() {
    if (!room) {
      return;
    }

    try {
      updateRoom({ ...room, status: "playing", game: createInitialUnoGame(room.players) });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the game.");
    }
  }

  async function handleAddGuest() {
    if (!room || room.players.length >= unoMaxPlayers) {
      return;
    }

    try {
      setRoom(await addUnoSimulatedPlayer(room));
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
    await leaveUnoRoom(roomId, localPlayerId);
  }

  function handleCardClick(card: UnoCard) {
    if (!game || !isMyTurn || !canPlayCard(game, card)) {
      return;
    }
    if (game.drawnCardId && game.drawnCardId !== card.id) {
      setError("After drawing you can only play the drawn card.");
      return;
    }

    if (card.color === "wild") {
      setPendingWildId(card.id);
      return;
    }

    handleAction(localPlayerId, { type: "play", cardId: card.id });
  }

  function handleColorChoice(color: UnoColor) {
    if (!pendingWildId) {
      return;
    }
    handleAction(localPlayerId, { type: "play", cardId: pendingWildId, chosenColor: color });
    setPendingWildId(null);
  }

  if (!roomLoaded) {
    return (
      <main className={styles.board}>
        <p className={styles.loading}>Joining room…</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className={styles.board}>
        <div className={styles.missingRoom}>
          <h1>Room not found</h1>
          <p>The code {roomId} does not match any UNO room.</p>
          <Link className={styles.exitLink} href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const discardStack = game ? game.discardPile.slice(-4) : [];
  const fanMid = (localHand.length - 1) / 2;
  const fanSpread = localHand.length > 1 ? Math.min(5, 32 / (localHand.length - 1)) : 0;
  const selectedCardSkin = cardSkins.find((skin) => skin.id === cardSkinId) ?? cardSkins[0];

  return (
    <main
      className={styles.board}
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
          UNO <em>Exile</em>
        </span>
        <button className={styles.codeButton} type="button" onClick={handleCopyCode}>
          {copiedCode ? "Copied!" : `Code ${room.id}`}
        </button>
      </header>

      {room.status === "lobby" || !game ? (
        <LobbyView
          isHost={isHost}
          onAddGuest={handleAddGuest}
          onStart={handleStartGame}
          room={room}
        />
      ) : (
        <>
          <section className={styles.opponentRow} aria-label="Opponents">
            {opponents.map((player) => {
              const hand = game.hands[player.id] ?? [];
              return (
                <div
                  className={
                    game.turnPlayerId === player.id ? styles.opponentActive : styles.opponent
                  }
                  key={player.id}
                >
                  <span className={styles.opponentAvatarWrap}>
                    <span className={styles.opponentAvatar} aria-hidden>
                      {player.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span
                      aria-label={`${hand.length} cards`}
                      className={hand.length === 1 ? styles.opponentCountUno : styles.opponentCount}
                      key={`count-${hand.length}`}
                    >
                      {hand.length}
                    </span>
                  </span>
                  <span className={styles.opponentInfo}>
                    <span className={styles.opponentName}>
                      {player.name}
                      {!player.connected && !player.isSimulated ? " (away)" : ""}
                    </span>
                    <span className={styles.opponentCards} aria-hidden key={hand.length}>
                      {Array.from({ length: Math.min(hand.length, 7) }).map((_, index) => (
                        <span
                          className={styles.miniCardBack}
                          key={index}
                          style={{ "--mini-index": index } as CSSProperties}
                        />
                      ))}
                    </span>
                  </span>
                  {hand.length === 1 ? <span className={styles.unoCorner}>UNO!</span> : null}
                </div>
              );
            })}
          </section>

          <section
            className={shaking ? `${styles.center} ${styles.centerShake}` : styles.center}
            aria-label="Table"
          >
            <div className={styles.directionWrap} data-direction={game.direction}>
              <span className={styles.directionPop} key={game.direction}>
                <span className={styles.directionArrow} aria-hidden>
                  {game.direction === 1 ? "⟳" : "⟲"}
                </span>
              </span>
            </div>

            <div className={styles.piles}>
              <button
                aria-label="Draw pile"
                className={styles.drawPile}
                disabled={!canDraw}
                type="button"
                onClick={() => handleAction(localPlayerId, { type: "draw" })}
              >
                <span className={styles.drawPileCount} key={game.drawPile.length}>
                  {game.drawPile.length}
                </span>
                <span className={styles.drawPileLabel}>
                  {game.pendingDraw > 0 ? `Draw +${game.pendingDraw}` : "Draw"}
                </span>
              </button>

              <div className={styles.discardWrap} data-color={game.activeColor}>
                <div className={styles.discardStack}>
                  {discardStack.map((card, index) => {
                    const jitter = cardJitter(card.id);
                    const isTop = index === discardStack.length - 1;
                    return (
                      <div
                        className={isTop ? styles.discardTop : styles.discardCard}
                        data-from={
                          isTop && card.id === lastLocalPlayRef.current ? "hand" : "table"
                        }
                        key={card.id}
                        style={
                          {
                            "--jx": `${jitter.x.toFixed(1)}px`,
                            "--jy": `${jitter.y.toFixed(1)}px`,
                            "--jr": `${jitter.rotation.toFixed(1)}deg`,
                          } as CSSProperties
                        }
                      >
                        <UnoCardFace card={card} size="large" />
                      </div>
                    );
                  })}
                  <span
                    aria-hidden
                    className={styles.colorPulse}
                    data-color={game.activeColor}
                    key={game.activeColor}
                  />
                </div>
              </div>
            </div>

            {game.pendingDraw > 0 ? (
              <div className={styles.stackBadge} key={game.pendingDraw}>
                +{game.pendingDraw} stacked
              </div>
            ) : null}

            <p className={styles.message} key={game.message}>
              {game.message}
            </p>
            <p className={styles.activeColor}>
              Color: <strong data-color={game.activeColor}>{unoColorLabel(game.activeColor)}</strong>
            </p>
          </section>

          <section className={styles.handArea} aria-label="Your hand">
            <div className={styles.handHeader}>
              <span
                className={isMyTurn ? styles.turnTagActive : styles.turnTag}
                key={game.turnPlayerId ?? "none"}
              >
                {game.phase === "finished"
                  ? "Game over"
                  : isMyTurn
                    ? game.drawnCardId
                      ? "Play the card you drew!"
                      : forcedToStack
                        ? "Your turn — you must stack!"
                        : "Your turn"
                    : `Waiting for ${players.find((player) => player.id === game.turnPlayerId)?.name ?? "…"}`}
              </span>
              {localHand.length === 1 ? <span className={styles.unoBadge}>UNO!</span> : null}
            </div>

            <div className={styles.hand} ref={handRef}>
              {localHand.map((card, index) => {
                const playable =
                  isMyTurn &&
                  canPlayCard(game, card) &&
                  (!game.drawnCardId || game.drawnCardId === card.id);
                const offset = index - fanMid;
                const normalized = fanMid > 0 ? offset / fanMid : 0;
                const jitter = cardJitter(card.id);
                return (
                  <HandCard
                    card={card}
                    drawn={game.drawnCardId === card.id}
                    key={card.id}
                    label={unoCardLabel(card)}
                    playable={playable}
                    style={
                      {
                        "--rot": `${(offset * fanSpread + jitter.rotation * 0.15).toFixed(2)}deg`,
                        "--ty": `${(normalized * normalized * 14 + jitter.y * 0.4).toFixed(1)}px`,
                      } as CSSProperties
                    }
                    onActivate={() => handleCardClick(card)}
                  />
                );
              })}
            </div>
          </section>

          {error ? <p className={styles.error}>{error}</p> : null}

          {splash ? (
            <div aria-hidden className={styles.splash} data-tone={splash.tone} key={splash.id}>
              {splash.text}
            </div>
          ) : null}

          {pendingWildId ? (
            <div className={styles.modalBackdrop} role="presentation" onClick={() => setPendingWildId(null)}>
              <div
                aria-label="Choose a color"
                aria-modal="true"
                className={styles.colorPicker}
                role="dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <h2>Choose a color</h2>
                <div className={styles.colorGrid}>
                  {unoColors.map((color) => (
                    <button
                      aria-label={unoColorLabel(color)}
                      className={styles.colorOption}
                      data-color={color}
                      key={color}
                      type="button"
                      onClick={() => handleColorChoice(color)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {game.phase === "finished" ? (
            <div className={styles.modalBackdrop} role="presentation">
              <div aria-modal="true" className={styles.winnerModal} role="dialog">
                <p className={styles.winnerEyebrow}>Game over</p>
                <h2>{winner ? `${winner.name} wins!` : "Game finished"}</h2>
                {isHost ? (
                  <button className={styles.startButton} type="button" onClick={handleStartGame}>
                    Play again
                  </button>
                ) : (
                  <p className={styles.waitNote}>Waiting for the host to start a new game…</p>
                )}
                <Link className={styles.exitLink} href="/" onClick={handleLeave}>
                  Leave table
                </Link>
              </div>
            </div>
          ) : null}
        </>
      )}

      {room.status === "lobby" && error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}

/**
 * One card in the local hand. Playable cards can be tapped/clicked or dragged
 * upward past a threshold to play — releasing early springs the card back.
 *
 * The hand strip is a scroll container, so a card transformed inside it gets
 * clipped as soon as it leaves the strip. While dragging we therefore hide the
 * real card into a faded slot and float a fixed-position clone (portaled to
 * the body) above the table, following the pointer.
 */
function HandCard({
  card,
  drawn,
  label,
  playable,
  style,
  onActivate,
}: {
  card: UnoCard;
  drawn: boolean;
  label: string;
  playable: boolean;
  style: CSSProperties;
  onActivate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pointerRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const originRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number; returning: boolean } | null>(null);

  // Safety net in case the return transition never fires its end event.
  useEffect(() => {
    if (!drag?.returning) {
      return;
    }
    const timer = window.setTimeout(() => setDrag(null), 400);
    return () => window.clearTimeout(timer);
  }, [drag?.returning]);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!playable || event.button !== 0) {
      return;
    }
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    buttonRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = pointerRef.current;
    const element = buttonRef.current;
    if (!pointer || !element || event.pointerId !== pointer.pointerId) {
      return;
    }
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (!pointer.moved && Math.hypot(dx, dy) > 6) {
      pointer.moved = true;
      // Center the clone on the card's true size — the bounding rect is
      // inflated by the fan rotation.
      const rect = element.getBoundingClientRect();
      originRef.current = {
        left: rect.left + rect.width / 2 - element.offsetWidth / 2,
        top: rect.top + rect.height / 2 - element.offsetHeight / 2,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    }
    if (pointer.moved) {
      setDrag({ dx, dy, returning: false });
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = pointerRef.current;
    if (!pointer || event.pointerId !== pointer.pointerId) {
      return;
    }
    pointerRef.current = null;
    if (!pointer.moved) {
      return;
    }
    suppressClickRef.current = true;
    const dy = event.clientY - pointer.startY;
    if (event.type !== "pointercancel" && dy < -dragPlayThreshold) {
      setDrag(null);
      onActivate();
    } else {
      // Spring the floating clone back to its slot before dropping it.
      setDrag((current) => (current ? { ...current, returning: true } : null));
    }
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onActivate();
  }

  const origin = originRef.current;
  const tilt = drag ? Math.max(-10, Math.min(10, drag.dx * 0.08)) : 0;

  return (
    <>
      <button
        aria-label={label}
        className={playable ? styles.handCardPlayable : styles.handCard}
        data-card-id={card.id}
        data-dragging={(drag !== null) || undefined}
        data-drawn={drawn || undefined}
        ref={buttonRef}
        style={style}
        type="button"
        onClick={handleClick}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <UnoCardFace card={card} size="hand" />
      </button>
      {drag && origin
        ? createPortal(
            <span
              aria-hidden
              className={styles.dragClone}
              style={{
                left: origin.left,
                top: origin.top,
                width: origin.width,
                height: origin.height,
                transform: drag.returning
                  ? "translate(0px, 0px) rotate(0deg) scale(1)"
                  : `translate(${drag.dx}px, ${drag.dy}px) rotate(${tilt.toFixed(1)}deg) scale(1.12)`,
                transition: drag.returning
                  ? "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : "none",
              }}
              onTransitionEnd={() => setDrag(null)}
            >
              <UnoCardFace card={card} size="hand" />
            </span>,
            document.body,
          )
        : null}
    </>
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
  room: UnoRoom;
}) {
  return (
    <section className={styles.lobby} aria-label="Lobby">
      <h1 className={styles.lobbyTitle}>Waiting room</h1>
      <p className={styles.lobbyHint}>
        Share the code <strong>{room.id}</strong> — friends join from the home page.
      </p>

      <ul className={styles.lobbyPlayers}>
        {room.players.map((player) => (
          <li key={player.id}>
            <span className={styles.lobbyAvatar} aria-hidden>
              {player.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{player.name}</span>
            {player.isHost ? <em>host</em> : null}
            {player.isSimulated ? <em>bot</em> : null}
            {!player.connected && !player.isSimulated ? <em>away</em> : null}
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className={styles.lobbyActions}>
          <button
            className={styles.secondaryLobbyButton}
            disabled={room.players.length >= unoMaxPlayers}
            type="button"
            onClick={onAddGuest}
          >
            Add guest bot
          </button>
          <button
            className={styles.startButton}
            disabled={room.players.length < 2}
            type="button"
            onClick={onStart}
          >
            Start game
          </button>
        </div>
      ) : (
        <p className={styles.waitNote}>Waiting for the host to start…</p>
      )}

      <div className={styles.rulesCard}>
        <h2>House rules</h2>
        <ul>
          <li>+2 and +4 cards stack — the penalty keeps growing.</li>
          <li>A +4 can land on a +2, but a +2 can never land on a +4.</li>
          <li>If you can stack, you must. Otherwise draw the whole pile.</li>
          <li>No playable card? Draw one card per click until one fits — then play it yourself.</li>
          <li>The deck never runs out — discards reshuffle forever.</li>
        </ul>
      </div>
    </section>
  );
}

function UnoCardFace({ card, size }: { card: UnoCard; size: "hand" | "large" }) {
  return (
    <span
      className={size === "large" ? styles.cardFaceLarge : styles.cardFace}
      data-color={card.color}
    >
      <span className={styles.cardCorner}>{unoValueLabel(card.value)}</span>
      <span className={styles.cardOval} aria-hidden />
      <span className={styles.cardValue}>{unoValueLabel(card.value)}</span>
      <span className={styles.cardCornerBottom}>{unoValueLabel(card.value)}</span>
    </span>
  );
}
