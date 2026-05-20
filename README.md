# Continental Multiplayer - Phase 2 Local

This version keeps everything local and adds a board-style multiplayer UI.
The server remains authoritative: all draw/discard/meld actions are validated server-side.

## Run locally

Terminal 1:
```bash
cd server
npm install
npm run dev
```

Terminal 2:
```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown by the client, usually `http://localhost:5173` or `http://localhost:5174`.

## Test multiplayer locally

1. Open one browser window.
2. Create a room.
3. Copy the room code.
4. Open another browser or incognito window.
5. Join the same room code.
6. Add bots until there are 4 seats.
7. Start game.

## Current controls

- Click deck/discard when it is your draw phase.
- Click cards to select.
- Select 1 card + `Descartar` to discard.
- Select contract cards + `Abater` to open your meld.
- Double-click a hand card to discard during discard phase.

## Next phase

Next we should connect the advanced drag/drop UI and full contra queue to this server-side engine.
