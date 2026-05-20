import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerGameSocket } from "./socket/gameSocket.js";

const app = express();
const configuredOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map(x => x.trim()).filter(Boolean)
  : null;

const corsOrigin = (origin, callback) => {
  // Local/dev default: allow localhost and LAN IPs so phones/tablets on the
  // same Wi‑Fi can connect to Socket.IO without editing env vars.
  if (!configuredOrigins) return callback(null, true);
  if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked origin: ${origin}`));
};

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Continental multiplayer server is running. Open the React client, not this page.");
});

app.get("/health", (_req, res) => {
  res.json({ ok:true });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET","POST"],
  },
});

registerGameSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Continental multiplayer server running on ${PORT}`);
  console.log("LAN/mobile mode enabled: open the Vite Network URL on your phone.");
});
