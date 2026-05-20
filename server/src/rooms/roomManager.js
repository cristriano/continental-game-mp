import { nanoid } from "nanoid";
import { createEmptyGame, addHuman, addBot, removePlayer, reconnectHuman } from "../engine/gameEngine.js";

const rooms = new Map();

export function createRoom(socketId, name) {
  const code = nanoid(5).toUpperCase();
  const game = createEmptyGame(code);
  rooms.set(code, game);
  const seat = addHuman(game, socketId, name);
  return { code, game, seat, seatToken: seat.seatToken };
}

export function joinRoom(code, socketId, name) {
  const game = rooms.get(code?.toUpperCase());
  if (!game) throw new Error("Room not found");

  // Local refresh fallback: when a disconnected player uses Join Room with the
  // same name, reclaim that previous seat instead of consuming a new one.
  const wantedName = String(name || "").trim().toLowerCase();
  if (wantedName) {
    const disconnectedSeat = game.players.find(p =>
      p.type === "human" &&
      !p.connected &&
      String(p.name || "").trim().toLowerCase() === wantedName
    );
    if (disconnectedSeat) {
      const seat = reconnectHuman(game, disconnectedSeat.id, disconnectedSeat.seatToken, socketId, name);
      return { code: game.roomCode, game, seat, seatToken: seat.seatToken };
    }
  }

  const seat = addHuman(game, socketId, name);
  return { code: game.roomCode, game, seat, seatToken: seat.seatToken };
}

export function reconnectRoom(code, seatId, seatToken, socketId, name) {
  const game = rooms.get(code?.toUpperCase());
  if (!game) throw new Error("Room not found");
  const seat = reconnectHuman(game, seatId, seatToken, socketId, name);
  return { code: game.roomCode, game, seat, seatToken: seat.seatToken };
}

export function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

export function addBotToRoom(code) {
  const game = getRoom(code);
  if (!game) throw new Error("Room not found");
  return addBot(game);
}

export function handleDisconnect(socketId) {
  const changed = [];
  for (const game of rooms.values()) {
    if (removePlayer(game, socketId)) changed.push(game);
  }
  return changed;
}

export function listRooms() {
  return [...rooms.values()].map(g => ({
    code: g.roomCode,
    players: g.players.filter(p => p.type !== "empty").length,
    phase: g.phase,
  }));
}
