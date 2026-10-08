// Custom server so Socket.io can attach to the same long-lived HTTP server as Next.js.
// Run with `node server.js` (this is what `npm run dev` / `npm start` do).
//
// IMPORTANT DEPLOYMENT NOTE: this only works on hosts that run a persistent Node
// process (Railway, Render, Fly.io, a VPS, etc). Vercel's serverless model does not
// support this — if you deploy there, the app still works, but real-time
// sync/presence silently won't (getIO() in lib/io.ts returns undefined and every
// caller already treats that as "no socket server available").
const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// boardId -> Map(socketId -> { userId, name })
const boardPresence = new Map();

function broadcastPresence(io, boardId) {
  const users = Array.from(boardPresence.get(boardId)?.values() ?? []);
  io.to(`board:${boardId}`).emit("presence:update", users);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, { path: "/api/socket" });

  io.on("connection", (socket) => {
    let joinedBoard = null;

    socket.on("join-board", ({ boardId, userId, name }) => {
      joinedBoard = boardId;
      socket.join(`board:${boardId}`);
      if (!boardPresence.has(boardId)) boardPresence.set(boardId, new Map());
      boardPresence.get(boardId).set(socket.id, { userId, name });
      broadcastPresence(io, boardId);
    });

    socket.on("card:editing", ({ boardId, cardId, name }) => {
      socket.to(`board:${boardId}`).emit("card:editing", { cardId, name });
    });

    socket.on("card:editing-stop", ({ boardId, cardId }) => {
      socket.to(`board:${boardId}`).emit("card:editing-stop", { cardId });
    });

    // DM room naming must match dmRoom() in app/api/messages/[userId]/route.ts
    socket.on("dm:join", ({ userId, withUserId }) => {
      const room = `dm:${[userId, withUserId].sort().join(":")}`;
      socket.join(room);
    });

    socket.on("disconnect", () => {
      if (joinedBoard && boardPresence.has(joinedBoard)) {
        boardPresence.get(joinedBoard).delete(socket.id);
        broadcastPresence(io, joinedBoard);
      }
    });
  });

  // Exposed so API route handlers (running in the same process) can push
  // updates after writing to the database. See lib/io.ts.
  global.io = io;

  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
