import { nanoid } from "nanoid";
import { ROUNDS, PHASE, TURN_ORDER_DEFAULT } from "./constants.js";
import { buildDeck, shuffle } from "./deck.js";
import { validateContract, canAddCardToMeld, normalizeMeldGroup } from "./validation.js";
import { cardPoints } from "./scoring.js";
import { chooseDrawSource, chooseBestDiscard, shouldBotBuyContra, tryAutoPlaceOnMelds, findContractMelds } from "./botAI.js";

const FREE_DISCARD_FROM = Object.fromEntries(TURN_ORDER_DEFAULT.map((name,i)=>[name,TURN_ORDER_DEFAULT[(i-1+TURN_ORDER_DEFAULT.length)%TURN_ORDER_DEFAULT.length]]));
function contraNeedsPenalty(buyer, discardedBy) { return !!buyer && !!discardedBy && FREE_DISCARD_FROM[buyer] !== discardedBy; }
function contraBuyersAfterDiscard(game, discardedBy) {
  const buyers = [];
  let cur = nextTurn(game, discardedBy);
  while (cur !== discardedBy) { buyers.push(cur); cur = nextTurn(game, cur); }
  return buyers;
}
function canBuyContra(game, buyerId, discardedBy) {
  const player = getPlayer(game, buyerId);
  const free = !contraNeedsPenalty(buyerId, discardedBy);
  return free || !player.hasDropped;
}

export function createEmptyGame(roomCode) {
  return {
    roomCode,
    phase: PHASE.LOBBY,
    roundIndex: 0,
    turn: "seat1",
    turnOrder: [...TURN_ORDER_DEFAULT],
    drawPile: [],
    discardPile: [],
    log: [],
    scores: Array(7).fill(null),
    contra: null,
    forcedDiscard: null,
    initialDiscardOfferPending: false,
    finalRanking: null,
    ready: { start: {}, newGame: {} },
    players: [makeSeat("seat1"), makeSeat("seat2"), makeSeat("seat3"), makeSeat("seat4")],
  };
}

function makeSeat(id) {
  return { id, name:id, type:"empty", socketId:null, seatToken:null, cards:[], meldedGroups:[], hasDropped:false, connected:false };
}

export function publicGameStateFor(game, socketId) {
  const viewer = game.players.find(p => p.socketId === socketId);
  return {
    ...game,
    viewerSeatId: viewer?.id || null,
    players: game.players.map(p => {
      const { seatToken, ...safe } = p;
      return { ...safe, cards: p.socketId === socketId ? p.cards : [], cardCount: p.cards.length };
    }),
    drawPile: [],
    drawCount: game.drawPile.length,
  };
}

export function addHuman(game, socketId, name) {
  const existing = game.players.find(p => p.socketId === socketId);
  if (existing) { existing.connected = true; return existing; }
  const seat = game.players.find(p => p.type === "empty");
  if (!seat) throw new Error("Room is full");
  seat.type = "human"; seat.socketId = socketId; seat.seatToken = nanoid(18); seat.name = name || `Player ${seat.id}`; seat.connected = true;
  return seat;
}

export function addBot(game) {
  const seat = game.players.find(p => p.type === "empty");
  if (!seat) throw new Error("Room is full");
  seat.type = "bot"; seat.name = `Bot ${seat.id.replace("seat","")}`; seat.connected = true;
  return seat;
}

export function removePlayer(game, socketId) {
  const p = game.players.find(x => x.socketId === socketId);
  if (!p) return false;
  p.connected = false;
  // Keep socketId for short reconnects, but public state will show disconnected.
  return true;
}

export function reconnectHuman(game, seatId, seatToken, socketId, name = "") {
  let seat = game.players.find(p => p.id === seatId && p.type === "human");
  if (seat && seatToken && seat.seatToken === seatToken) {
    // If the same saved seat token is opened in another tab/window while the
    // original seat is still connected, do NOT steal that seat. This was the
    // reason two browser windows could appear to be two players but actually
    // counted as one human seat, allowing one Start click to begin the game.
    // A real page refresh normally disconnects the old socket first, so the
    // seat will be marked disconnected and can reconnect normally.
    if (seat.connected && seat.socketId && seat.socketId !== socketId) {
      throw new Error("Seat already connected in another tab");
    }
    seat.socketId = socketId;
    seat.connected = true;
    return seat;
  }

  // Fallback for local testing: if the browser refreshed before the token was
  // saved, recover the disconnected seat by exact player name instead of
  // treating the user as a new player and saying the room is full.
  const wantedName = String(name || "").trim().toLowerCase();
  if (wantedName) {
    seat = game.players.find(p =>
      p.type === "human" &&
      !p.connected &&
      String(p.name || "").trim().toLowerCase() === wantedName
    );
    if (seat) {
      seat.socketId = socketId;
      seat.connected = true;
      return seat;
    }
  }

  throw new Error("Reconnect failed");
}
function ensureReady(game) {
  if (!game.ready) game.ready = { start: {}, newGame: {} };
  if (!game.ready.start) game.ready.start = {};
  if (!game.ready.newGame) game.ready.newGame = {};
  return game.ready;
}

function humanSeats(game) {
  // Count occupied human seats, not socket connections. A disconnected/refreshing
  // human seat is still a player and must not be ignored for Start/New Game votes.
  return game.players.filter(p => p.type === "human");
}

function readyCount(game, mode) {
  const ready = ensureReady(game)[mode] || {};
  return humanSeats(game).filter(p => ready[p.id]).length;
}

function readyNeeded(game) {
  return Math.max(1, humanSeats(game).length);
}

function allHumansReady(game, mode) {
  const humans = humanSeats(game);
  if (!humans.length) return false;
  const ready = ensureReady(game)[mode] || {};
  return humans.every(p => ready[p.id]);
}

export function startGame(game) {
  game.roundIndex = 0;
  game.scores = Array(7).fill(null);
  game.finalRanking = null;
  game.ready = { start: {}, newGame: {} };
  return dealRound(game, 0);
}

export function requestStartGame(game, playerId) {
  if (game.phase !== PHASE.LOBBY) throw new Error("Game already started");
  const player = getPlayer(game, playerId);
  if (player.type !== "human") throw new Error("Only humans need to ready up");
  const ready = ensureReady(game);
  const wasReady = !!ready.start[playerId];
  ready.start[playerId] = true;
  if (!wasReady) game.log.unshift(`${player.name} está pronto para começar (${readyCount(game, "start")}/${readyNeeded(game)}).`);
  if (allHumansReady(game, "start")) return startGame(game);
  return game;
}

export function requestNewGame(game, playerId) {
  if (game.phase !== PHASE.GAME_END) throw new Error("Game is not finished");
  const player = getPlayer(game, playerId);
  if (player.type !== "human") throw new Error("Only humans need to ready up");
  const ready = ensureReady(game);
  const wasReady = !!ready.newGame[playerId];
  ready.newGame[playerId] = true;
  if (!wasReady) game.log.unshift(`${player.name} está pronto para novo jogo (${readyCount(game, "newGame")}/${readyNeeded(game)}).`);
  if (allHumansReady(game, "newGame")) return startGame(game);
  return game;
}

export function dealRound(game, roundIndex) {
  game.roundIndex = roundIndex;
  const round = ROUNDS[roundIndex];
  const deck = shuffle(buildDeck());
  game.players.forEach(p => { p.cards = []; p.meldedGroups = []; p.hasDropped = false; });
  let i = 0;
  for (let c = 0; c < round.cards; c++) {
    for (const seatId of game.turnOrder) getPlayer(game, seatId).cards.push(deck[i++]);
  }
  game.discardPile = [deck[i++]];
  game.drawPile = deck.slice(i);
  game.turn = "seat1";
  game.phase = PHASE.DRAW;
  game.contra = null;
  game.forcedDiscard = null;
  game.finalRanking = null;
  game.ready = { start: {}, newGame: {} };
  game.initialDiscardOfferPending = true;
  game.log = [`${round.label} — ${round.cards} cartas. ${label(game.discardPile[0])} abre o descarte.`];
  return game;
}

function drawDeckDirect(game, playerId) {
  const player = getPlayer(game, playerId);
  const card = game.drawPile.shift();
  if (!card) throw new Error("Deck empty");
  player.cards.push(card);
  game.turn = playerId;
  game.phase = PHASE.DISCARD;
  game.log.unshift(`${player.name} comprou ${label(card)} do baralho.`);
  return game;
}

export function drawDeck(game, playerId) {
  assertTurn(game, playerId, PHASE.DRAW);

  // Special start-of-round rule: when the opening discard is still untouched and
  // the first player chooses the deck instead, the other players get a contra
  // chance for that opening discard first. After that queue resolves, this same
  // player automatically draws from the deck and goes to discard phase.
  if (game.initialDiscardOfferPending && game.discardPile[0]) {
    game.initialDiscardOfferPending = false;
    return startInitialDiscardOffers(game, game.discardPile[0], playerId, "drawDeck");
  }

  return drawDeckDirect(game, playerId);
}

export function drawDiscard(game, playerId) {
  assertTurn(game, playerId, PHASE.DRAW);
  game.initialDiscardOfferPending = false;
  const player = getPlayer(game, playerId);
  const card = game.discardPile.shift();
  if (!card) throw new Error("Discard empty");
  player.cards.push(card);
  game.phase = PHASE.DISCARD;
  game.forcedDiscard = { playerId, avoidId: card.id };
  game.log.unshift(`${player.name} pegou ${label(card)} do descarte.`);
  return game;
}

export function discardCard(game, playerId, cardId) {
  assertTurn(game, playerId, PHASE.DISCARD);
  const player = getPlayer(game, playerId);
  if (game.forcedDiscard?.playerId === playerId && game.forcedDiscard?.avoidId === cardId && player.cards.length > 1) {
    throw new Error("Não podes descartar a mesma carta que acabaste de apanhar.");
  }
  const idx = player.cards.findIndex(c => c.id === cardId);
  if (idx < 0) throw new Error("Card not in hand");
  const [card] = player.cards.splice(idx, 1);
  game.discardPile.unshift(card);
  game.initialDiscardOfferPending = false;
  game.forcedDiscard = null;
  game.log.unshift(`${player.name} descartou ${label(card)}.`);
  if (player.hasDropped && player.cards.length === 0) return endRound(game, playerId);
  return startContraOffers(game, card, playerId);
}

function startContraOffers(game, card, discardedBy) {
  const normalNext = nextTurn(game, discardedBy);
  const queue = contraBuyersAfterDiscard(game, discardedBy).filter(id => canBuyContra(game, id, discardedBy));
  if (!card || queue.length === 0) return continueAfterContra(game, normalNext, false, null);
  game.contra = { cardId: card.id, discardedBy, pendingTurn: normalNext, queue };
  game.turn = queue[0];
  game.phase = PHASE.CONTRA;
  return game;
}

function startInitialDiscardOffers(game, card, pendingPlayerId, afterAction) {
  // Opening discard has no real discarder, so everyone after the first player
  // gets a contra chance in normal turn order. Because it is not from their
  // immediate previous player, any buyer takes a penalty card.
  const queue = [];
  let cur = nextTurn(game, pendingPlayerId);
  while (cur !== pendingPlayerId) {
    if (canBuyContra(game, cur, "initial")) queue.push(cur);
    cur = nextTurn(game, cur);
  }

  if (!card || queue.length === 0) {
    return afterAction === "drawDeck" ? drawDeckDirect(game, pendingPlayerId) : continueAfterContra(game, pendingPlayerId, false, null);
  }

  game.log.unshift(`Carta inicial ${label(card)} disponível para contra antes de ${getPlayer(game, pendingPlayerId).name} comprar do baralho.`);
  game.contra = { cardId: card.id, discardedBy:"initial", pendingTurn: pendingPlayerId, queue, afterAction };
  game.turn = queue[0];
  game.phase = PHASE.CONTRA;
  return game;
}

export function buyContra(game, playerId) {
  if (game.phase !== PHASE.CONTRA || game.turn !== playerId || game.contra?.queue?.[0] !== playerId) throw new Error("Not your contra decision");
  const cardId = game.contra.cardId;
  const cardIdx = game.discardPile.findIndex(c => c.id === cardId);
  if (cardIdx < 0) return continueAfterContra(game, game.contra.pendingTurn, false, null);
  const [card] = game.discardPile.splice(cardIdx, 1);
  const player = getPlayer(game, playerId);
  const needsPenalty = contraNeedsPenalty(playerId, game.contra.discardedBy);
  const penalty = needsPenalty ? game.drawPile.shift() : null;
  player.cards.push(card);
  if (penalty) player.cards.push(penalty);
  game.log.unshift(needsPenalty && penalty ? `${player.name} comprou CONTRA ${label(card)} + pena.` : `${player.name} comprou CONTRA ${label(card)} sem pena.`);
  const wasNormalNext = playerId === game.contra.pendingTurn && !needsPenalty;
  const avoidId = wasNormalNext ? card.id : null;
  return continueAfterContra(game, game.contra.pendingTurn, wasNormalNext, avoidId);
}

export function passContra(game, playerId) {
  if (game.phase !== PHASE.CONTRA || game.turn !== playerId || game.contra?.queue?.[0] !== playerId) throw new Error("Not your contra decision");
  const [, ...rest] = game.contra.queue;
  if (rest.length === 0) return continueAfterContra(game, game.contra.pendingTurn, false, null);
  game.contra.queue = rest;
  game.turn = rest[0];
  return game;
}

function continueAfterContra(game, nextPlayerId, mustDiscard, avoidId) {
  const afterAction = game.contra?.afterAction || null;
  game.contra = null;

  if (afterAction === "drawDeck") {
    game.forcedDiscard = null;
    return drawDeckDirect(game, nextPlayerId);
  }

  game.turn = nextPlayerId;
  const next = getPlayer(game, nextPlayerId);
  game.phase = mustDiscard ? PHASE.DISCARD : (next.type === "bot" ? PHASE.BOT : PHASE.DRAW);
  game.forcedDiscard = mustDiscard && avoidId ? { playerId: nextPlayerId, avoidId } : null;
  return game;
}

export function meldCards(game, playerId, cardIds) {
  assertTurn(game, playerId, PHASE.DISCARD);
  const player = getPlayer(game, playerId);
  if (player.hasDropped) throw new Error("Já abateste nesta mão.");
  const selected = cardIds.map(id => player.cards.find(c => c.id === id));
  if (selected.some(c => !c)) throw new Error("Invalid selected cards");
  const result = validateContract(selected, ROUNDS[game.roundIndex]);
  if (!result.valid) throw new Error(result.reason);
  const idSet = new Set(cardIds);
  player.cards = player.cards.filter(c => !idSet.has(c.id));
  player.meldedGroups = result.melds.map(normalizeMeldGroup);
  player.hasDropped = true;
  game.log.unshift(`${player.name} abateu ${result.melds.length} grupo(s).`);
  if (player.cards.length === 0) return endRound(game, playerId);
  return game;
}

export function reorderHand(game, playerId, cardIds) {
  const player = getPlayer(game, playerId);
  if (!Array.isArray(cardIds)) throw new Error("Invalid card order");
  const currentIds = new Set(player.cards.map(c => c.id));
  if (cardIds.length !== player.cards.length || cardIds.some(id => !currentIds.has(id))) throw new Error("Invalid card order");
  const byId = new Map(player.cards.map(c => [c.id, c]));
  player.cards = cardIds.map(id => byId.get(id));
  return game;
}

export function addToMeld(game, playerId, cardId, targetPlayerId, groupIndex, side = null) {
  assertTurn(game, playerId, PHASE.DISCARD);
  const player = getPlayer(game, playerId);
  if (!player.hasDropped) throw new Error("Só podes acrescentar cartas depois de abater.");
  const cardIdx = player.cards.findIndex(c => c.id === cardId);
  if (cardIdx < 0) throw new Error("Card not in hand");
  const target = getPlayer(game, targetPlayerId);
  const group = target.meldedGroups?.[groupIndex];
  if (!target.hasDropped || !group) throw new Error("Invalid meld target");
  const rawCard = player.cards[cardIdx];
  const card = rawCard.isJoker && side ? { ...rawCard, __seqSide: side } : rawCard;
  if (!canAddCardToMeld(group, card)) throw new Error("Essa carta não encaixa nesse grupo.");
  player.cards.splice(cardIdx, 1);
  group.cards.push(card);
  target.meldedGroups[groupIndex] = normalizeMeldGroup(group);
  game.log.unshift(`${player.name} acrescentou ${label(rawCard)} ao abatimento de ${target.name}.`);
  if (player.hasDropped && player.cards.length === 0) return endRound(game, playerId);
  return game;
}

function cardFitsAnyPublicMeld(game, card) {
  if (!card) return false;
  for (const target of game.players) {
    if (!target.hasDropped || !target.meldedGroups?.length) continue;
    for (const group of target.meldedGroups) {
      if (canAddCardToMeld(group, card)) return true;
    }
  }
  return false;
}

export function playBotContraDecision(game, botId) {
  const bot = getPlayer(game, botId);
  if (game.phase !== PHASE.CONTRA || game.turn !== botId || bot.type !== "bot") return game;

  const card = game.discardPile.find(c => c.id === game.contra?.cardId);
  const discardedBy = game.contra?.discardedBy;
  const needsPenalty = contraNeedsPenalty(botId, discardedBy);
  const canBuy = canBuyContra(game, botId, discardedBy);

  // Important rule for bots that already opened/melded:
  // they cannot buy contra with pena, but they SHOULD take the normal previous
  // player's discard without pena when that card can immediately be placed on
  // any public meld. Example: Bot 3 discards 3, Bot 4 already has a trio of 3s;
  // Bot 4 should take the 3 without pena, place it on that trio, then discard.
  const isFreePickup = !needsPenalty;
  const immediatelyFitsMeld = isFreePickup && bot.hasDropped && cardFitsAnyPublicMeld(game, card);

  if (canBuy && (immediatelyFitsMeld || shouldBotBuyContra(bot.cards, card, ROUNDS[game.roundIndex], needsPenalty))) {
    return buyContra(game, botId);
  }

  return passContra(game, botId);
}

export function playBotTurn(game, botId) {
  const bot = getPlayer(game, botId);
  if (bot.type !== "bot") return game;
  const round = ROUNDS[game.roundIndex];
  let avoidId = game.forcedDiscard?.playerId === botId ? game.forcedDiscard?.avoidId : null;
  if (game.phase === PHASE.BOT || game.phase === PHASE.DRAW) {
    if (game.initialDiscardOfferPending && game.discardPile[0]) {
      game.initialDiscardOfferPending = false;
    }
    const source = chooseDrawSource(bot.cards, game.discardPile[0], round);
    if (source === "discard" && game.discardPile.length) {
      const card = game.discardPile.shift();
      bot.cards.push(card); avoidId = card.id;
      game.log.unshift(`${bot.name} pegou ${label(card)} do descarte.`);
    } else {
      const card = game.drawPile.shift();
      if (card) { bot.cards.push(card); game.log.unshift(`${bot.name} comprou do baralho.`); }
    }
  }
  if (!bot.hasDropped) {
    const result = findContractMelds(bot.cards, round);
    if (result.valid) {
      const used = new Set(result.melds.flatMap(g => g.cards.map(c => c.id)));
      bot.cards = bot.cards.filter(c => !used.has(c.id));
      bot.meldedGroups = result.melds.map(normalizeMeldGroup);
      bot.hasDropped = true;
      game.log.unshift(`${bot.name} abateu.`);
    }
  }
  game = tryAutoPlaceOnMelds(game, botId);
  if (bot.hasDropped && bot.cards.length === 0) return endRound(game, botId);
  const discard = chooseBestDiscard(bot.cards, round, avoidId);
  if (!discard) return game;
  bot.cards = bot.cards.filter(c => c.id !== discard.id);
  game.discardPile.unshift(discard);
  game.forcedDiscard = null;
  game.log.unshift(`${bot.name} descartou ${label(discard)}.`);
  if (bot.hasDropped && bot.cards.length === 0) return endRound(game, botId);
  return startContraOffers(game, discard, botId);
}

function scoreTotals(game) {
  return game.players.map((_, playerIndex) =>
    (game.scores || []).reduce((sum, row) => sum + (row?.[playerIndex] ?? 0), 0)
  );
}

function buildFinalRanking(game) {
  const totals = scoreTotals(game);
  return game.players
    .map((p, index) => ({
      playerId: p.id,
      name: p.name,
      type: p.type,
      total: totals[index] ?? 0,
      index,
    }))
    .filter(p => p.type !== "empty")
    .sort((a, b) => (a.total - b.total) || (a.index - b.index));
}

export function endRound(game, winnerId) {
  const winnerIdx = game.players.findIndex(p => p.id === winnerId);
  const roundScores = game.players.map((p, i) => i === winnerIdx ? 0 : p.cards.reduce((sum,c)=>sum+cardPoints(c),0));
  game.scores[game.roundIndex] = roundScores;
  const isLastRound = game.roundIndex >= ROUNDS.length - 1;
  game.phase = isLastRound ? PHASE.GAME_END : PHASE.ROUND_END;
  game.contra = null;
  game.forcedDiscard = null;
  game.finalRanking = isLastRound ? buildFinalRanking(game) : null;
  const roundWinner = getPlayer(game,winnerId).name;
  if (isLastRound) {
    const champion = game.finalRanking?.[0]?.name || roundWinner;
    game.log.unshift(`${roundWinner} venceu a mão. ${champion} venceu o jogo!`);
  } else {
    game.log.unshift(`${roundWinner} venceu a mão.`);
  }
  return game;
}

export function nextRound(game, playerId = null) {
  // On final game end, Novo Jogo is a ready vote: all connected humans must click.
  // Bots are automatically ready; empty seats do not block the new game.
  if (game.phase === PHASE.GAME_END || game.roundIndex >= ROUNDS.length - 1) {
    if (!playerId) return game;
    return requestNewGame(game, playerId);
  }
  return dealRound(game, game.roundIndex + 1);
}

function getPlayer(game, playerId) {
  const p = game.players.find(x => x.id === playerId);
  if (!p) throw new Error("Player not found");
  return p;
}
function assertTurn(game, playerId, expectedPhase) { if (game.turn !== playerId) throw new Error("Not your turn"); if (game.phase !== expectedPhase) throw new Error("Invalid phase"); }
function nextTurn(game, current) { const idx = game.turnOrder.indexOf(current); return game.turnOrder[(idx + 1) % game.turnOrder.length]; }
function label(c) { return c ? (c.isJoker ? "Joker" : `${c.value}${c.suit}`) : "?"; }
