import {
  createRoom,
  joinRoom,
  getRoom,
  addBotToRoom,
  handleDisconnect,
  reconnectRoom,
} from "../rooms/roomManager.js";

import {
  publicGameStateFor,
  requestStartGame,
  drawDeck,
  drawDiscard,
  discardCard,
  meldCards,
  addToMeld,
  reorderHand,
  nextRound,
  playBotTurn,
  playBotContraDecision,
  buyContra,
  passContra,
} from "../engine/gameEngine.js";

function emitRoom(io, roomCode, game) {
  const sockets = io.sockets.adapter.rooms.get(roomCode) || new Set();
  for (const socketId of sockets) {
    io.to(socketId).emit("game_state", publicGameStateFor(game, socketId));
  }
}

async function runBotsIfNeeded(io, roomCode) {
  const game = getRoom(roomCode);
  if (!game || game.botRunning) return;
  game.botRunning = true;
  try {
    let safety = 0;
    while (safety++ < 30) {
      const current = game.players.find(p => p.id === game.turn);
      if (!current || current.type !== "bot") break;
      if (!["bot","draw","discard","contra"].includes(game.phase)) break;
      await new Promise(resolve => setTimeout(resolve, 650));
      if (game.phase === "contra") playBotContraDecision(game, current.id);
      else playBotTurn(game, current.id);
      emitRoom(io, roomCode, game);
    }
  } finally {
    game.botRunning = false;
  }
}

export function registerGameSocket(io) {
  io.on("connection", socket => {
    socket.on("create_room", ({ name } = {}, ack) => {
      try {
        const { code, game, seat, seatToken } = createRoom(socket.id, name);
        socket.join(code);
        ack?.({ ok:true, code, seatId: seat.id, seatToken });
        emitRoom(io, code, game);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      }
    });

    socket.on("join_room", ({ code, name } = {}, ack) => {
      try {
        const { game, seat, seatToken } = joinRoom(code, socket.id, name);
        socket.join(game.roomCode);
        ack?.({ ok:true, code: game.roomCode, seatId: seat.id, seatToken });
        emitRoom(io, game.roomCode, game);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      }
    });

    socket.on("reconnect_room", ({ code, seatId, seatToken, name } = {}, ack) => {
      try {
        const { game, seat } = reconnectRoom(code, seatId, seatToken, socket.id, name);
        socket.join(game.roomCode);
        ack?.({ ok:true, code: game.roomCode, seatId: seat.id, seatToken: seat.seatToken });
        emitRoom(io, game.roomCode, game);
        runBotsIfNeeded(io, game.roomCode);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      }
    });

    socket.on("add_bot", ({ code } = {}, ack) => {
      try {
        addBotToRoom(code);
        const game = getRoom(code);
        ack?.({ ok:true });
        emitRoom(io, game.roomCode, game);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      }
    });

    socket.on("start_game", async ({ code } = {}, ack) => {
      try {
        const game = getRoom(code);
        if (!game) throw new Error("Room not found");
        const player = game.players.find(p => p.socketId === socket.id);
        if (!player) throw new Error("Player not in room");
        requestStartGame(game, player.id);
        ack?.({ ok:true });
        emitRoom(io, code, game);
        await runBotsIfNeeded(io, code);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      }
    });

    socket.on("action", async ({ code, type, payload } = {}, ack) => {
      let game;
      try {
        game = getRoom(code);
        if (!game) throw new Error("Room not found");
        if (game.processingAction && type !== "reorderHand") throw new Error("Action already processing, try again");
        game.processingAction = true;
        const player = game.players.find(p => p.socketId === socket.id);
        if (!player) throw new Error("Player not in room");

        if (type === "drawDeck") drawDeck(game, player.id);
        else if (type === "drawDiscard") drawDiscard(game, player.id);
        else if (type === "discard") discardCard(game, player.id, payload.cardId);
        else if (type === "meld") meldCards(game, player.id, payload.cardIds);
        else if (type === "addToMeld") addToMeld(game, player.id, payload.cardId, payload.targetPlayerId, payload.groupIndex, payload.side);
        else if (type === "buyContra") buyContra(game, player.id);
        else if (type === "passContra") passContra(game, player.id);
        else if (type === "reorderHand") reorderHand(game, player.id, payload.cardIds);
        else if (type === "nextRound") nextRound(game, player.id);
        else throw new Error("Unknown action");

        ack?.({ ok:true });
        emitRoom(io, code, game);
        await runBotsIfNeeded(io, code);
      } catch (e) {
        ack?.({ ok:false, error:e.message });
      } finally {
        if (game) game.processingAction = false;
      }
    });

    socket.on("disconnect", () => {
      const changed = handleDisconnect(socket.id);
      for (const game of changed) emitRoom(io, game.roomCode, game);
    });
  });
}
