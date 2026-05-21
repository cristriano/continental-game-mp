import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import "./style.css";

const TURN_ORDER = ["seat1", "seat4", "seat3", "seat2"];
const FREE_DISCARD_FROM = Object.fromEntries(
  TURN_ORDER.map((seat, i) => [seat, TURN_ORDER[(i - 1 + TURN_ORDER.length) % TURN_ORDER.length]])
);
function contraNeedsPenalty(buyer, discardedBy) {
  return !!buyer && !!discardedBy && FREE_DISCARD_FROM[buyer] !== discardedBy;
}
const ROUNDS = [
  { index:0, label:"Mão 1", code:"TT",  goalPT:"2 Trios",               cards:7,  trios:2, seqs:0 },
  { index:1, label:"Mão 2", code:"TR",  goalPT:"1 Trio + 1 Sequência",  cards:8,  trios:1, seqs:1 },
  { index:2, label:"Mão 3", code:"RR",  goalPT:"2 Sequências",           cards:9,  trios:0, seqs:2 },
  { index:3, label:"Mão 4", code:"TTT", goalPT:"3 Trios",               cards:10, trios:3, seqs:0 },
  { index:4, label:"Mão 5", code:"TTR", goalPT:"2 Trios + 1 Sequência", cards:11, trios:2, seqs:1 },
  { index:5, label:"Mão 6", code:"TRR", goalPT:"1 Trio + 2 Sequências", cards:12, trios:1, seqs:2 },
  { index:6, label:"Mão 7", code:"RRR", goalPT:"3 Sequências",           cards:13, trios:0, seqs:3 },
];
const RED_SUITS = new Set(["♥","♦"]);
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const VALUE_RANK = Object.fromEntries(VALUES.map((v,i)=>[v,i]));
const SUIT_ORDER = {"♠":0,"♥":1,"♦":2,"♣":3};

function cardLabel(card) { return card ? (card.isJoker ? "Joker" : `${card.value}${card.suit}`) : "?"; }
function displayName(player, meId) {
  if (!player) return "—";
  if (player.id === meId) return "Você";
  return player.name || player.id;
}

function PlayingCard({ card, selected=false, small=false, back=false, empty=false, clickable=false, draggable=false, dragOver=false, onClick, onDoubleClick, onDragStart, onDragOver, onDrop, onDragEnd }) {
  if (back) {
    return (
      <div className={`playing-card back ${small ? "small" : ""} ${clickable ? "clickable" : ""}`} onClick={onClick}>
        <div className="back-inner">♦</div>
      </div>
    );
  }
  if (empty || !card) {
    return <div className={`playing-card empty ${small ? "small" : ""}`}>—</div>;
  }
  if (card.isJoker) {
    return (
      <div className={`playing-card joker ${small ? "small" : ""} ${selected ? "selected" : ""} ${clickable ? "clickable" : ""} ${dragOver ? "dragOver" : ""}`} onClick={onClick} onDoubleClick={onDoubleClick} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}>
        <span className="joker-icon">🃏</span>
        <span className="joker-label">JOKER</span>
      </div>
    );
  }
  const isRed = RED_SUITS.has(card.suit);
  return (
    <div className={`playing-card ${small ? "small" : ""} ${selected ? "selected" : ""} ${clickable ? "clickable" : ""} ${dragOver ? "dragOver" : ""}`} onClick={onClick} onDoubleClick={onDoubleClick} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}>
      <div className={isRed ? "corner red" : "corner black"}><div>{card.value}</div><div>{card.suit}</div></div>
      <div className={isRed ? "corner red rotate" : "corner black rotate"}><div>{card.value}</div><div>{card.suit}</div></div>
    </div>
  );
}

function CardBackStack({ count, vertical=false }) {
  const shown = Math.min(Math.max(count || 0, 0), 10);
  if (!shown) return <div className="emptyBack">—</div>;
  return (
    <div className={`cardBackStack ${vertical ? "vertical" : "horizontal"}`}>
      {Array.from({ length: shown }).map((_, i) => <div key={i} className="overlap"><PlayingCard back small /></div>)}
    </div>
  );
}

function MiniMelds({ player, orientation="vertical", meId, onGroupDrop, dropTarget }) {
  if (!player?.hasDropped || !player?.meldedGroups?.length) return null;
  const horizontal = orientation === "horizontal";
  return (
    <div className={`compactMelds ${horizontal ? "horizontal" : "vertical"}`}>
      <div className="compactOwner">✓ {displayName(player, meId)}</div>
      <div className="compactGroups">
        {player.meldedGroups.map((group, gi) => (
          <div className={`compactGroup ${dropTarget?.playerId===player.id && dropTarget?.groupIndex===gi ? "groupDragOver" : ""}`} key={`${player.id}-${gi}`} data-meld-player-id={player.id} data-meld-group-index={gi} onDragOver={e=>{ if(onGroupDrop){ e.preventDefault(); } }} onDrop={e=>onGroupDrop?.(e, player.id, gi)}>
            <div className={group.type === "trio" ? "compactLabel trio" : "compactLabel seq"}>{group.type === "trio" ? "Trio" : "Seq"}</div>
            <div className={`compactCards ${horizontal ? "horizontal" : "vertical"}`}>
              {(group.cards || []).map((c, ci) => <div className="meldCardWrap" key={c.id || ci}><PlayingCard card={c} small /></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BotPlayer({ player, pos, active, meId, onGroupDrop, dropTarget }) {
  if (!player) return null;
  const vertical = pos === "left" || pos === "right";
  return (
    <div className={`botArea ${pos}`}>
      {pos === "right" && <MiniMelds player={player} orientation="vertical" meId={meId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />}
      <div className={`botPlayer ${vertical ? "vertical" : "horizontal"} ${active ? "active" : ""}`}>
        <div className="botName">{displayName(player, meId)}</div>
        {active && <div className="turnBadge">▶ VEZ</div>}
        {player.hasDropped && <div className="dropBadge">✓ ABATEU</div>}
        <CardBackStack count={player.cardCount ?? 0} vertical={vertical} />
        <div className="cardCount">{player.cardCount ?? 0} cartas</div>
      </div>
      {pos === "left" && <MiniMelds player={player} orientation="vertical" meId={meId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />}
      {pos === "top" && <MiniMelds player={player} orientation="horizontal" meId={meId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />}
    </div>
  );
}

function RoundBanner({ round }) {
  const pills=[];
  for (let i=0;i<round.trios;i++) pills.push("trio");
  for (let i=0;i<round.seqs;i++) pills.push("seq");
  return (
    <div className="roundBanner">
      <div><div className="tinyTitle">RODADA</div><div className="roundTitle">{round.label}</div></div>
      <div className="goal"><div>{pills.map((type,i)=><span className={`pill ${type}`} key={i}>{type === "trio" ? "Trio" : "Seq"}</span>)}</div><small>{round.goalPT}</small></div>
      <div className="roundCards"><strong>{round.cards}</strong><span>cartas</span></div>
    </div>
  );
}

function Lobby({ connected, error, name, setName, code, setCode, createRoom, joinRoom }) {
  return (
    <div className="lobby">
      <h1>CONTINENTAL MULTIPLAYER</h1>
      <p className={connected ? "ok" : "bad"}>Server: {connected ? "connected" : "disconnected"}</p>
      <div className="lobbyBox">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" />
        <button onClick={createRoom} disabled={!connected} className="gold">Create Room</button>
        <div className="divider" />
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Room code" />
        <button onClick={joinRoom} disabled={!connected} className="blue">Join Room</button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function totalsByPlayer(game) {
  return game.players?.map((_, playerIndex) =>
    (game.scores || []).reduce((sum, row) => sum + (row?.[playerIndex] ?? 0), 0)
  ) || [];
}

function rankingForGame(game) {
  const totals = totalsByPlayer(game);
  return (game.players || [])
    .map((p, index) => ({ player: p, index, total: totals[index] ?? 0 }))
    .filter(x => x.player.type !== "empty")
    .sort((a,b) => (a.total - b.total) || (a.index - b.index));
}

function RoundEndModal({ game, meId, onNextRound }) {
  if (!game || !["round_end","game_end"].includes(game.phase)) return null;
  const roundScores = game.scores?.[game.roundIndex] || [];
  const totals = totalsByPlayer(game);
  const ranking = rankingForGame(game);
  const isGameEnd = game.phase === "game_end" || game.roundIndex >= ROUNDS.length - 1;
  const winnerMsg = game.log?.[0] || "Mão encerrada.";
  const humanSeats = (game.players || []).filter(p => p.type === "human");
  const newGameReady = game.ready?.newGame || {};
  const readyCount = humanSeats.filter(p => newGameReady[p.id]).length;
  const readyNeeded = Math.max(1, humanSeats.length);
  const meReady = !!newGameReady[meId];
  return (
    <div className="modalOverlay">
      <div className="roundModal">
        <div className="modalSub">{isGameEnd ? "JOGO ENCERRADO" : `${ROUNDS[game.roundIndex]?.label} ENCERRADA`}</div>
        <div className="modalTitle">{isGameEnd ? `🏆 ${displayName(ranking[0]?.player, meId)} venceu o jogo!` : winnerMsg}</div>

        {!isGameEnd && (
          <div className="scoreRows">
            {game.players?.map((p, i) => p.type !== "empty" && (
              <div className="scoreRow" key={p.id}>
                <span>{displayName(p, meId)}</span>
                <strong>{roundScores[i] == null ? "·" : `${roundScores[i] === 0 ? "0" : "+" + roundScores[i]} pts`}</strong>
              </div>
            ))}
          </div>
        )}

        {isGameEnd && (
          <div className="rankingRows">
            {ranking.map((r, pos) => (
              <div className={`scoreRow rank${pos === 0 ? " champion" : ""}`} key={r.player.id}>
                <span>{pos === 0 ? "🏆" : `${pos+1}.`} {displayName(r.player, meId)}</span>
                <strong>{r.total} pts</strong>
              </div>
            ))}
          </div>
        )}

        {!isGameEnd && (
          <div className="modalTotals">
            {game.players?.map((p, i) => p.type !== "empty" && (
              <span key={p.id}>{displayName(p, meId)}: <b>{totals[i] ?? 0}</b></span>
            ))}
          </div>
        )}

        {isGameEnd && (
          <div className="modalReady">Prontos para novo jogo: <b>{readyCount}/{readyNeeded}</b></div>
        )}
        <button className="gold full" disabled={isGameEnd && meReady} onClick={onNextRound}>
          {isGameEnd ? (meReady ? "Aguardando jogadores..." : "Novo Jogo") : "→ Próxima Mão"}
        </button>
      </div>
    </div>
  );
}

function Scoreboard({ game, meId, onClose }) {
  if (!game) return null;
  const activeRounds = game.scores || [];
  return (
    <div className="scoreboardPanel">
      <div className="scoreboardHeader">
        <strong>PLACAR GERAL</strong>
        <button className="miniBtn" onClick={onClose}>✕ fechar</button>
      </div>
      <div className="scoreboardTableWrap">
        <table className="scoreboardTable">
          <thead>
            <tr>
              <th>Mão</th>
              {game.players?.filter(p=>p.type!=="empty").map(p => <th key={p.id}>{displayName(p, meId)}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROUNDS.map((r, ri) => (
              <tr key={r.index} className={ri === game.roundIndex ? "current" : ""}>
                <td>{r.code}</td>
                {game.players?.filter(p=>p.type!=="empty").map(p => {
                  const originalIndex = game.players.findIndex(x=>x.id===p.id);
                  const v = activeRounds?.[ri]?.[originalIndex];
                  return <td key={p.id}>{v == null ? "·" : v}</td>;
                })}
              </tr>
            ))}
            <tr className="totalRow">
              <td>Total</td>
              {game.players?.filter(p=>p.type!=="empty").map(p => {
                const originalIndex = game.players.findIndex(x=>x.id===p.id);
                const total = activeRounds.reduce((sum,row)=>sum + (row?.[originalIndex] ?? 0), 0);
                const has = activeRounds.some(row=>row?.[originalIndex] != null);
                return <td key={p.id}>{has ? total : "·"}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractStatus({ selectedCount, me, round }) {
  if (!selectedCount) return null;
  const needed = round.trios * 3 + round.seqs * 4;
  if (me?.hasDropped) return <span className="selBadge warn">Já abateste</span>;
  return <span className={selectedCount >= needed ? "selBadge" : "selBadge warn"}>{selectedCount} sel. / mín. {needed}</span>;
}


function getSeatStorage() {
  // Seat identity must be per-tab/window. localStorage is shared between tabs,
  // which made two browser windows reconnect as the same player and allowed
  // one click to satisfy readiness. sessionStorage survives refresh but is
  // isolated per tab, which is exactly what we need.
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.sessionStorage;
}
function getGlobalStorage() {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
}
const seatStore = getSeatStorage();
const globalStore = getGlobalStorage();

export default function App() {
  const [name, setName] = useState(globalStore.getItem("continental_name") || "");
  const initialRoomCode = (() => {
    if (typeof window === "undefined") return globalStore.getItem("continental_roomCode") || "";
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get("room") || params.get("code") || "").toUpperCase();
    const savedCode = (globalStore.getItem("continental_roomCode") || "").toUpperCase();

    // Invite links are allowed to point to a different room than the last
    // saved session on this device. In that case we must NOT try to reconnect
    // with the old seat token, otherwise the server correctly returns
    // "Reconnect failed" before the user can join the invited room.
    if (fromQuery && savedCode && fromQuery !== savedCode) {
      seatStore.removeItem("continental_seatId");
      seatStore.removeItem("continental_seatToken");
      globalStore.setItem("continental_roomCode", fromQuery);
    }

    return (fromQuery || savedCode || "").toUpperCase();
  })();
  const [code, setCode] = useState(initialRoomCode);
  const [seatId, setSeatId] = useState(seatStore.getItem("continental_seatId") || null);
  const [seatToken, setSeatToken] = useState(seatStore.getItem("continental_seatToken") || null);
  const [game, setGame] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [selected, setSelected] = useState(new Set());
  const dragRef = useRef({ ids: [], source: null });
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const touchDragRef = useRef({ active:false, dragging:false, ids:[], startX:0, startY:0, x:0, y:0 });
  const [touchGhost, setTouchGhost] = useState(null);
  const suppressNextClickRef = useRef(false);
  const [pendingAction, setPendingAction] = useState(false);
  const reconnectAttemptedRef = useRef(false);

  useEffect(() => {
    const setViewportVars = () => {
      const width = window.visualViewport?.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.style.setProperty("--app-width", `${width}px`);

      // Real iPhone landscape has a very small visual viewport because of the browser UI.
      // Scale the whole board only in short landscape screens so it fits without scrolling.
      const isLandscape = width > height;
      const isShort = height <= 520;
      if (isLandscape && isShort) {
        const baseW = 820;
        const baseH = 390;
        const scale = Math.min(width / baseW, height / baseH, 1);
        document.documentElement.style.setProperty("--landscape-scale", `${scale}`);
        document.documentElement.style.setProperty("--landscape-base-width", `${baseW}px`);
        document.documentElement.style.setProperty("--landscape-base-height", `${baseH}px`);
      } else {
        document.documentElement.style.removeProperty("--landscape-scale");
        document.documentElement.style.removeProperty("--landscape-base-width");
        document.documentElement.style.removeProperty("--landscape-base-height");
      }
    };
    setViewportVars();
    window.addEventListener("resize", setViewportVars);
    window.addEventListener("orientationchange", setViewportVars);
    window.visualViewport?.addEventListener("resize", setViewportVars);
    window.visualViewport?.addEventListener("scroll", setViewportVars);
    return () => {
      window.removeEventListener("resize", setViewportVars);
      window.removeEventListener("orientationchange", setViewportVars);
      window.visualViewport?.removeEventListener("resize", setViewportVars);
      window.visualViewport?.removeEventListener("scroll", setViewportVars);
    };
  }, []);

  useEffect(() => { globalStore.setItem("continental_name", name || ""); }, [name]);
  useEffect(() => { if (code) globalStore.setItem("continental_roomCode", code); }, [code]);
  useEffect(() => { if (seatId) seatStore.setItem("continental_seatId", seatId); }, [seatId]);
  useEffect(() => { if (seatToken) seatStore.setItem("continental_seatToken", seatToken); }, [seatToken]);
  useEffect(() => {
    const tryReconnect = () => {
      const savedCode = (globalStore.getItem("continental_roomCode") || "").toUpperCase();
      const savedSeatId = seatStore.getItem("continental_seatId");
      const savedToken = seatStore.getItem("continental_seatToken");
      if (!savedCode || !savedSeatId || !savedToken || reconnectAttemptedRef.current) return;
      reconnectAttemptedRef.current = true;
      setCode(savedCode);
      setPendingAction(true);
      socket.emit("reconnect_room", { code: savedCode, seatId: savedSeatId, seatToken: savedToken, name: globalStore.getItem("continental_name") || name }, ackHandler);
    };

    const onConnect = () => {
      setConnected(true);
      setError("");
      tryReconnect();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => { setConnected(false); setError(`Cannot connect to server: ${err.message}`); };
    const onGame = (state) => setGame(state);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("game_state", onGame);

    // Important: Vite/React can mount after Socket.IO has already connected,
    // so the "connect" event may not fire again. Try once immediately too.
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("game_state", onGame);
    };
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [game?.roundIndex, game?.phase === "round_end", game?.phase === "game_end"]);

  function saveSession(nextCode, nextSeatId, nextSeatToken) {
    if (nextCode) globalStore.setItem("continental_roomCode", String(nextCode).toUpperCase());
    if (nextSeatId) seatStore.setItem("continental_seatId", String(nextSeatId));
    if (nextSeatToken) seatStore.setItem("continental_seatToken", String(nextSeatToken));
  }

  function ackHandler(res) {
    setPendingAction(false);
    if (!res?.ok) {
      const msg = res?.error || "Unknown error";
      setError(msg);
      const lowerMsg = String(msg).toLowerCase();
      if (lowerMsg.includes("reconnect") || lowerMsg.includes("seat already connected")) {
        seatStore.removeItem("continental_seatId");
        seatStore.removeItem("continental_seatToken");
        setSeatId(null);
        setSeatToken(null);
        reconnectAttemptedRef.current = false;
      }
      return;
    }
    setError("");

    // Persist immediately inside the ack. Relying only on useEffect/state can lose
    // the seat token if the user refreshes right after creating/joining a room.
    if (res.code || res.seatId || res.seatToken) {
      const nextCode = res.code || code;
      const nextSeatId = res.seatId || seatId;
      const nextSeatToken = res.seatToken || seatToken;
      saveSession(nextCode, nextSeatId, nextSeatToken);
      if (nextCode) setCode(nextCode);
      if (nextSeatId) setSeatId(nextSeatId);
      if (nextSeatToken) setSeatToken(nextSeatToken);
      if (nextCode && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", String(nextCode).toUpperCase());
        window.history.replaceState({}, "", url.toString());
      }
    }
  }
  const emit = (event, payload) => {
    setPendingAction(true);
    socket.emit(event, payload, ackHandler);
  };

  const joinOrReconnect = () => {
    const wantedCode = (code || "").toUpperCase();
    // The Join button must mean "join as a new player". Auto-reconnect is
    // already attempted on page load for refreshes. Reusing a saved seat token
    // here caused two tabs/windows in the same browser to reconnect as the
    // same seat, so the room had only one human and Start Game did not wait.
    seatStore.removeItem("continental_seatId");
    seatStore.removeItem("continental_seatToken");
    setSeatId(null);
    setSeatToken(null);
    reconnectAttemptedRef.current = false;
    emit("join_room", { code: wantedCode, name });
  };
  const action = (type, payload = {}) => {
    if (pendingAction && type !== "reorderHand") return;
    setPendingAction(true);
    socket.emit("action", { code, type, payload }, ackHandler);
  };

  function leaveLocalRoom() {
    globalStore.removeItem("continental_roomCode");
    seatStore.removeItem("continental_seatId");
    seatStore.removeItem("continental_seatToken");
    setCode("");
    setSeatId(null);
    setSeatToken(null);
    setGame(null);
    setSelected(new Set());
    reconnectAttemptedRef.current = false;
    if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
  }

  function inviteLink(roomCode = game?.roomCode || code) {
    if (typeof window === "undefined" || !roomCode) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("room", String(roomCode).toUpperCase());
    return url.toString();
  }

  async function copyInviteLink() {
    const link = inviteLink();
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setError("Link da sala copiado.");
      setTimeout(()=>setError(""), 1800);
    } catch {
      setError(link);
    }
  }


  function sendReorder(cards) {
    action("reorderHand", { cardIds: cards.map(c => c.id) });
  }

  function onCardDragStart(e, card, idx) {
    const ids = selected.has(card.id) ? [...selected] : [card.id];
    dragRef.current = { ids, source: "hand" };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ids.join(","));
  }

  function onCardDragOver(e, idx) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function onCardDrop(e, targetIdx) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIdx(null);
    const ids = dragRef.current.ids || [];
    if (!me?.cards?.length || !ids.length) return;

    const moving = me.cards.filter(c => ids.includes(c.id));
    const remaining = me.cards.filter(c => !ids.includes(c.id));
    const beforeTarget = me.cards.findIndex(c => c.id === me.cards[targetIdx]?.id);
    let insertAt = targetIdx;
    const removedBefore = me.cards.slice(0, beforeTarget).filter(c => ids.includes(c.id)).length;
    insertAt = Math.max(0, Math.min(remaining.length, targetIdx - removedBefore));
    const reordered = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
    sendReorder(reordered);
  }

  function onDragEnd() {
    dragRef.current = { ids: [], source: null };
    setDragOverIdx(null);
    setDropTarget(null);
  }

  function onDiscardDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const ids = dragRef.current.ids || [];
    if (!canDiscard || ids.length !== 1) return;
    setSelected(new Set());
    action("discard", { cardId: ids[0] });
  }

  function onMeldZoneDrop(e) {
    e.preventDefault();
    const ids = dragRef.current.ids || [];
    if (!canDiscard || ids.length < 3 || me?.hasDropped) return;
    setSelected(new Set());
    action("meld", { cardIds: ids });
  }

  function onGroupDrop(e, targetPlayerId, groupIndex) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const ids = dragRef.current.ids || [];
    if (!canDiscard || !me?.hasDropped || ids.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const horizontal = rect.width >= rect.height;
    const side = horizontal
      ? (e.clientX < rect.left + rect.width / 2 ? "left" : "right")
      : (e.clientY < rect.top + rect.height / 2 ? "left" : "right");
    action("addToMeld", { cardId: ids[0], targetPlayerId, groupIndex, side });
  }

  const viewerSeatId = game?.viewerSeatId || seatId;
  const me = game?.players?.find(p => p.id === viewerSeatId);
  const round = ROUNDS[game?.roundIndex || 0];
  const topDiscard = game?.discardPile?.[0];
  const isMyTurn = game?.turn === viewerSeatId;
  const canDraw = isMyTurn && game?.phase === "draw";
  const canDiscard = isMyTurn && game?.phase === "discard";
  const canContra = isMyTurn && game?.phase === "contra" && game?.contra?.cardId;
  const contraCard = game?.discardPile?.find(c => c.id === game?.contra?.cardId);
  const roomFull = (game?.players || []).filter(p => p.type !== "empty").length >= 4;
  const actionBlocked = pendingAction && game?.phase !== "lobby";
  const humanSeats = (game?.players || []).filter(p => p.type === "human");
  const startReady = game?.ready?.start || {};
  const startReadyCount = humanSeats.filter(p => startReady[p.id]).length;
  const startReadyNeeded = Math.max(1, humanSeats.length);
  const meStartReady = !!startReady[viewerSeatId];
  const startButtonLabel = game?.phase === "lobby"
    ? (meStartReady ? `Pronto (${startReadyCount}/${startReadyNeeded})` : `Start Game (${startReadyCount}/${startReadyNeeded})`)
    : "Start Game";

  const positions = useMemo(() => {
    if (!game) return {};
    const myIdxRaw = TURN_ORDER.indexOf(viewerSeatId || "seat1");
    const myIdx = myIdxRaw >= 0 ? myIdxRaw : 0;
    const relative = (offset) => TURN_ORDER[(myIdx + offset + TURN_ORDER.length) % TURN_ORDER.length];
    return {
      bottom: game.players.find(p => p.id === relative(0)),
      // Counter-clockwise table: from your bottom seat, the next player is on the right,
      // then top, then left. This keeps the local player always at bottom while preserving
      // the server authoritative order: seat1 → seat4 → seat3 → seat2.
      right: game.players.find(p => p.id === relative(1)),
      top: game.players.find(p => p.id === relative(2)),
      left: game.players.find(p => p.id === relative(3)),
    };
  }, [game, viewerSeatId]);

  function toggleCard(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function discardSelected() {
    if (selected.size !== 1) return;
    const [cardId] = [...selected];
    setSelected(new Set());
    action("discard", { cardId });
  }
  function meldSelected() {
    if (selected.size < 3) return;
    const cardIds = [...selected];
    setSelected(new Set());
    action("meld", { cardIds });
  }

  function sortBySequence() {
    if (!me?.cards?.length) return;
    const sorted = [...me.cards].sort((a,b)=>{
      if (a.isJoker && b.isJoker) return 0;
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      const suitDiff = (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9);
      if (suitDiff) return suitDiff;
      return (VALUE_RANK[a.value] ?? 99) - (VALUE_RANK[b.value] ?? 99);
    });
    setSelected(new Set());
    sendReorder(sorted);
  }

  function sortByGroups() {
    if (!me?.cards?.length) return;
    const counts = new Map();
    for (const c of me.cards) if (!c.isJoker) counts.set(c.value, (counts.get(c.value) || 0) + 1);
    const sorted = [...me.cards].sort((a,b)=>{
      if (a.isJoker && b.isJoker) return 0;
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      const groupDiff = (counts.get(b.value) || 0) - (counts.get(a.value) || 0);
      if (groupDiff) return groupDiff;
      const rankDiff = (VALUE_RANK[a.value] ?? 99) - (VALUE_RANK[b.value] ?? 99);
      if (rankDiff) return rankDiff;
      return (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9);
    });
    setSelected(new Set());
    sendReorder(sorted);
  }

  function startTouchCard(e, card) {
    if (e.pointerType === "mouse") return;
    if (!me?.cards?.some(c => c.id === card.id)) return;
    const ids = selected.has(card.id) ? [...selected] : [card.id];
    touchDragRef.current = { active:true, dragging:false, ids, startX:e.clientX, startY:e.clientY, x:e.clientX, y:e.clientY };
  }

  useEffect(() => {
    function cleanupTouchDrag() {
      touchDragRef.current = { active:false, dragging:false, ids:[], startX:0, startY:0, x:0, y:0 };
      setTouchGhost(null);
      setDragOverIdx(null);
      setDropTarget(null);
      document.body.classList.remove("touch-dragging");
    }

    function onPointerMove(e) {
      const d = touchDragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.dragging && Math.hypot(dx, dy) > 9) {
        d.dragging = true;
        suppressNextClickRef.current = true;
        document.body.classList.add("touch-dragging");
      }
      if (!d.dragging) return;
      e.preventDefault();
      d.x = e.clientX;
      d.y = e.clientY;
      setTouchGhost({ x:e.clientX, y:e.clientY, count:d.ids.length, cards:(me?.cards || []).filter(c => d.ids.includes(c.id)).slice(0,3) });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const handEl = el?.closest?.("[data-hand-idx]");
      const meldEl = el?.closest?.("[data-meld-player-id][data-meld-group-index]");
      setDragOverIdx(handEl ? Number(handEl.dataset.handIdx) : null);
      setDropTarget(meldEl ? { playerId: meldEl.dataset.meldPlayerId, groupIndex: Number(meldEl.dataset.meldGroupIndex) } : null);
    }

    function onPointerUp(e) {
      const d = touchDragRef.current;
      if (!d.active) return;
      if (!d.dragging) { cleanupTouchDrag(); return; }
      e.preventDefault();
      const ids = d.ids || [];
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const handEl = el?.closest?.("[data-hand-idx]");
      const discardEl = el?.closest?.("[data-discard-drop]");
      const meldEl = el?.closest?.("[data-meld-player-id][data-meld-group-index]");
      const tableEl = el?.closest?.("[data-table-drop]");

      if (discardEl && canDiscard && ids.length === 1) {
        setSelected(new Set());
        action("discard", { cardId: ids[0] });
      } else if (meldEl && canDiscard && me?.hasDropped && ids.length === 1) {
        const rect = meldEl.getBoundingClientRect();
        const horizontal = rect.width >= rect.height;
        const side = horizontal
          ? (e.clientX < rect.left + rect.width / 2 ? "left" : "right")
          : (e.clientY < rect.top + rect.height / 2 ? "left" : "right");
        action("addToMeld", { cardId: ids[0], targetPlayerId: meldEl.dataset.meldPlayerId, groupIndex: Number(meldEl.dataset.meldGroupIndex), side });
      } else if (handEl && me?.cards?.length && ids.length) {
        const targetIdx = Number(handEl.dataset.handIdx);
        const moving = me.cards.filter(c => ids.includes(c.id));
        const remaining = me.cards.filter(c => !ids.includes(c.id));
        const beforeTarget = me.cards.findIndex(c => c.id === me.cards[targetIdx]?.id);
        const removedBefore = me.cards.slice(0, beforeTarget).filter(c => ids.includes(c.id)).length;
        const insertAt = Math.max(0, Math.min(remaining.length, targetIdx - removedBefore));
        sendReorder([...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)]);
      } else if (tableEl && canDiscard && !me?.hasDropped && ids.length >= 3) {
        setSelected(new Set());
        action("meld", { cardIds: ids });
      }
      cleanupTouchDrag();
    }

    window.addEventListener("pointermove", onPointerMove, { passive:false });
    window.addEventListener("pointerup", onPointerUp, { passive:false });
    window.addEventListener("pointercancel", cleanupTouchDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", cleanupTouchDrag);
    };
  }, [me, canDiscard, selected, code, pendingAction]);

  if (!game && pendingAction && reconnectAttemptedRef.current) {
    return (
      <div className="lobby">
        <h1>CONTINENTAL MULTIPLAYER</h1>
        <p className={connected ? "ok" : "bad"}>Server: {connected ? "connected" : "disconnected"}</p>
        <div className="lobbyBox">
          <h2 style={{color:'#ffd700', margin:0}}>A reconectar...</h2>
          <p style={{color:'rgba(255,255,255,.7)'}}>A tentar voltar à sala {code || globalStore.getItem("continental_roomCode") || ""}.</p>
          <button className="blue" onClick={leaveLocalRoom}>Cancelar / sair da sala</button>
        </div>
      </div>
    );
  }

  if (!game) return <Lobby connected={connected} error={error} name={name} setName={setName} code={code} setCode={setCode} createRoom={()=>emit("create_room", { name })} joinRoom={joinOrReconnect} />;

  return (
    <div className="appShell">
      <aside className="roundLog">
        <div className="logHeader"><strong>LOG DA RODADA</strong><span>{game.log?.length || 0}</span></div>
        <div className="logList">{game.log?.map((l,i)=><div key={`${i}-${l}`} className={`logItem ${i===0 ? "latest" : ""}`}>{l}</div>)}</div>
      </aside>

      <main className="gameArea">
        <RoundBanner round={round} />
        <div className="topBar">
          <h1>CONTINENTAL</h1>
          <span className={isMyTurn ? "status my" : "status"}>{isMyTurn ? "SUA VEZ" : `VEZ: ${displayName(game.players.find(p=>p.id===game.turn), viewerSeatId).toUpperCase()}`}</span>
          <div className="roomActions">
            <span className={connected ? "netStatus ok" : "netStatus bad"}>{connected ? "online" : "offline"}</span><button className="blue" onClick={()=>setShowBoard(v=>!v)}>📊 Placar</button><button className="blue" onClick={copyInviteLink}>Link: {game.roomCode}</button>
            <button className="blue" disabled={roomFull || game.phase !== "lobby" || pendingAction} onClick={()=>emit("add_bot", { code })}>Add Bot</button>
            <button className="gold" disabled={game.phase !== "lobby" || pendingAction || meStartReady} onClick={()=>emit("start_game", { code })}>{startButtonLabel}</button><button className="blue" onClick={leaveLocalRoom}>Sair</button>
          </div>
        </div>

        {error && <div className="toastError">{error}</div>}
        {canContra && (
          <div className="contraModal">
            <div className="contraTitle">⚡ Comprar contra?</div>
            <div className="contraText">{cardLabel(contraCard)} foi descartado</div>
            <div className={contraNeedsPenalty(viewerSeatId, game?.contra?.discardedBy) ? "contraPenalty penalty" : "contraPenalty free"}>
              {contraNeedsPenalty(viewerSeatId, game?.contra?.discardedBy) ? "+ pena" : "sem pena — depois tens de descartar"}
            </div>
            <div className="contraActions">
              <button className="gold" disabled={actionBlocked} onClick={()=>action("buyContra")}>Comprar</button>
              <button className="blue" disabled={actionBlocked} onClick={()=>action("passContra")}>Passar</button>
            </div>
          </div>
        )}
        <RoundEndModal game={game} meId={viewerSeatId} onNextRound={()=>action("nextRound")} />
        {showBoard && <Scoreboard game={game} meId={viewerSeatId} onClose={()=>setShowBoard(false)} />}

        <section className="table" data-table-drop="true" onDragOver={e=>canDiscard && !me?.hasDropped && e.preventDefault()} onDrop={onMeldZoneDrop}>
          <BotPlayer player={positions.top} pos="top" active={game.turn === positions.top?.id} meId={viewerSeatId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />
          <BotPlayer player={positions.left} pos="left" active={game.turn === positions.left?.id} meId={viewerSeatId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />
          <BotPlayer player={positions.right} pos="right" active={game.turn === positions.right?.id} meId={viewerSeatId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} />

          <div className="centerPiles">
            <div className={canDraw ? "phaseHint draw" : canDiscard ? "phaseHint discard" : "phaseHint"}>
              {canContra ? "Decide se queres comprar contra" : canDraw ? "Compre uma carta para continuar" : canDiscard ? "Descarte ou abata" : `Aguardando ${displayName(game.players.find(p=>p.id===game.turn), viewerSeatId)}...`}
            </div>
            <small>{game.drawCount ?? 0} cartas no baralho</small>
            <div className="piles">
              <div className={canDraw ? "pile clickable" : "pile"} onClick={()=>canDraw && !actionBlocked && action("drawDeck")}>
                <div className="deckWithCount"><PlayingCard back clickable={canDraw} /><span>{game.drawCount > 99 ? "99+" : game.drawCount}</span></div>
                <strong>COMPRAR</strong>
              </div>
              <div className={canDraw ? "pile clickable" : "pile"} data-discard-drop="true" onClick={()=>canDraw && !actionBlocked && action("drawDiscard")} onDragOver={e=>canDiscard && e.preventDefault()} onDrop={onDiscardDrop}>
                <PlayingCard card={topDiscard} clickable={canDraw} />
                <strong>DESCARTE</strong>
              </div>
            </div>
          </div>
        </section>

        <div className="playerMeldRow"><MiniMelds player={me} orientation="horizontal" meId={viewerSeatId} onGroupDrop={onGroupDrop} dropTarget={dropTarget} /></div>

        <section className="handPanel">
          <div className="handHeader">
            <div><span className="greenDot" /> SUA MÃO {isMyTurn && <span className="turnBadge inline">▶ ATIVO</span>}</div>
            <div className="handActions">
              <span>{me?.cardCount ?? me?.cards?.length ?? 0} cartas</span>
              {selected.size > 0 && <ContractStatus selectedCount={selected.size} me={me} round={round} />}
              <button className="blue" onClick={sortBySequence}>Sequência</button><button className="blue" onClick={sortByGroups}>Pares/Trios</button><button className="blue" disabled={!canDiscard || selected.size !== 1 || actionBlocked} onClick={discardSelected}>Descartar</button>
              <button className="gold" disabled={!canDiscard || selected.size < 3 || me?.hasDropped || actionBlocked} onClick={meldSelected}>Abater</button>
            </div>
          </div>
          <div className="handCards">
            {me?.cards?.map((card, idx) => (
              <div key={card.id} className={`touchCardWrap ${selected.has(card.id) ? "isSelected" : ""} ${dragOverIdx===idx ? "isDragOver" : ""}`} style={{"--hand-index": idx}} data-hand-idx={idx} onPointerDown={e=>startTouchCard(e, card)}>
                <PlayingCard card={card} selected={selected.has(card.id)} clickable draggable onClick={()=>{ if (suppressNextClickRef.current) { suppressNextClickRef.current=false; return; } toggleCard(card.id); }} onDoubleClick={()=>canDiscard && !actionBlocked && action("discard", { cardId: card.id })} onDragStart={e=>onCardDragStart(e, card, idx)} onDragOver={e=>onCardDragOver(e, idx)} onDrop={e=>onCardDrop(e, idx)} onDragEnd={onDragEnd} dragOver={dragOverIdx===idx} />
              </div>
            ))}
          </div>
          {touchGhost && <div className="touchGhost touchGhostCards" style={{left:touchGhost.x, top:touchGhost.y}}>{touchGhost.cards?.length ? touchGhost.cards.map((c, i) => <div className="touchGhostCard" style={{"--ghost-index": i}} key={c.id || i}><PlayingCard card={c} /></div>) : (touchGhost.count > 1 ? `${touchGhost.count} cartas` : "1 carta")}</div>}
          </section>
      </main>
    </div>
  );
}
