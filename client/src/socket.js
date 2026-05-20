import { io } from "socket.io-client";

function getDefaultServerUrl() {
  if (typeof window === "undefined") return "http://localhost:3001";

  const { protocol, hostname } = window.location;

  // Desktop local dev: keep using localhost so existing PC testing works.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3001";
  }

  // Phone/tablet on same Wi‑Fi: connect to the backend on the same LAN IP
  // that loaded the frontend, but on the Socket.IO server port.
  return `${protocol}//${hostname}:3001`;
}

const URL = import.meta.env.VITE_SERVER_URL || getDefaultServerUrl();

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  transports: ["websocket", "polling"],
});

export const SOCKET_URL = URL;
