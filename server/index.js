import { WebSocketServer } from "ws";
import { createServer } from "http";
import crypto from "crypto";

const PORT = process.env.PORT || 3001;
const RECONNECT_GRACE_MS = 5 * 60 * 1000;
const rooms = new Map();

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "lan-bingo-server" }));
});

const wss = new WebSocketServer({ server: httpServer });

function send(socket, message) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
}

function broadcast(room, message) {
  for (const client of room.clients) send(client.socket, message);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeBoard(count) {
  return shuffle(Array.from({ length: count }, (_, i) => i + 1));
}

function isValidBoard(board, count) {
  if (!Array.isArray(board) || board.length !== count) return false;
  if (new Set(board).size !== count) return false;
  return board.every((n) => Number.isInteger(n) && n >= 1 && n <= count);
}

function getCompletedLines(board, called) {
  if (!Array.isArray(board) || board.length !== 25) return [];

  const lines = [];
  for (let row = 0; row < 5; row++) {
    lines.push([0, 1, 2, 3, 4].map((col) => row * 5 + col));
  }
  for (let col = 0; col < 5; col++) {
    lines.push([0, 1, 2, 3, 4].map((row) => row * 5 + col));
  }
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

  return lines.filter((line) => line.every((index) => called.has(board[index])));
}

function hasBingo(board, called) {
  return getCompletedLines(board, called).length >= 5;
}

function calculateScore(totalPlayers, placement) {
  return Math.max(0, (totalPlayers - placement) * 10);
}

function getNextActiveIndex(players, currentIndex) {
  if (!players.length) return -1;
  for (let offset = 1; offset <= players.length; offset++) {
    const index = (currentIndex + offset) % players.length;
    if (players[index]?.active) return index;
  }
  return -1;
}

function publicGame(room) {
  return room.game;
}

function sendGame(room) {
  broadcast(room, { type: "GAME_STATE", game: publicGame(room) });
}

function touchGame(room) {
  room.game.version += 1;
}

function makeInitialGame(count, player) {
  return {
    version: 1,
    phase: "waiting",
    count,
    called: [],
    players: [{
      ...player,
      connected: true,
      active: true,
      eliminated: false,
      placement: null,
      score: 0,
    }],
    turnIndex: 0,
    nextPlacement: 1,
  };
}

function resetPlayer(player) {
  return {
    ...player,
    active: true,
    eliminated: false,
    placement: null,
    score: 0,
  };
}

function getClientByPlayerId(room, playerId) {
  return [...room.clients].find((client) => client.player?.id === playerId) || null;
}

function sendPrivateCard(room, playerId, socket) {
  const board = room.boards.get(playerId);
  if (!board) return;
  send(socket, { type: "NEW_CARD", board, count: room.game.count });
}

function addOrReconnectPlayer(room, player, board, client) {
  const existingPlayer = room.game.players.find((p) => p.id === player.id);

  if (existingPlayer) {
    const existingClient = getClientByPlayerId(room, player.id);
    if (existingClient && existingClient !== client) {
      room.clients.delete(existingClient);
      existingClient.socket = null;
      existingClient.room = null;
    }

    if (room.boards.has(player.id)) {
      client.player = { id: existingPlayer.id, name: existingPlayer.name };
    } else if (isValidBoard(board, room.game.count)) {
      room.boards.set(player.id, board);
      client.player = { id: existingPlayer.id, name: existingPlayer.name };
    } else {
      return false;
    }

    existingPlayer.connected = true;
    client.room = room;
    room.clients.add(client);
    if (client.disconnectTimer) clearTimeout(client.disconnectTimer);
    touchGame(room);
    send(client.socket, {
      type: "ROOM_READY",
      room: room.id,
      isHost: room.hostId === player.id,
      reconnected: true,
      game: publicGame(room),
    });
    sendPrivateCard(room, player.id, client.socket);
    sendGame(room);
    return true;
  }

  if (room.game.phase !== "waiting") return false;
  if (room.game.players.length >= 20) return false;
  if (!isValidBoard(board, room.game.count)) return false;

  room.boards.set(player.id, board);
  room.game.players.push({
    ...player,
    connected: true,
    active: true,
    eliminated: false,
    placement: null,
    score: 0,
  });
  client.room = room;
  client.player = { id: player.id, name: player.name };
  room.clients.add(client);
  touchGame(room);

  send(client.socket, {
    type: "ROOM_READY",
    room: room.id,
    isHost: false,
    reconnected: false,
    game: publicGame(room),
  });
  sendGame(room);
  return true;
}

function eliminateWinners(room, winnerIds) {
  const current = room.game;
  const unique = [...new Set(winnerIds)].filter((id) =>
    current.players.some((player) => player.id === id && player.active)
  );
  if (!unique.length) return false;

  const placement = current.nextPlacement;
  const totalPlayers = current.players.length;
  const score = calculateScore(totalPlayers, placement);

  current.players = current.players.map((player) =>
    unique.includes(player.id)
      ? { ...player, active: false, eliminated: true, placement, score }
      : player
  );

  current.nextPlacement = placement + unique.length;
  const activeIndexes = current.players
    .map((player, index) => (player.active ? index : -1))
    .filter((index) => index !== -1);

  if (activeIndexes.length <= 1) {
    if (activeIndexes.length === 1) {
      const lastIndex = activeIndexes[0];
      const lastPlacement = current.nextPlacement;
      current.players[lastIndex] = {
        ...current.players[lastIndex],
        active: false,
        eliminated: true,
        placement: lastPlacement,
        score: calculateScore(totalPlayers, lastPlacement),
      };
      current.nextPlacement = lastPlacement + 1;
    }
    current.phase = "game-over";
    current.turnIndex = -1;
  } else if (!current.players[current.turnIndex]?.active) {
    current.turnIndex = getNextActiveIndex(current.players, current.turnIndex);
  }

  touchGame(room);
  sendGame(room);
  return true;
}

function startGame(room, client) {
  if (client.player?.id !== room.hostId) return;
  if (room.game.players.length < 2) return;
  if (room.game.players.some((p) => !p.connected)) return;

  room.game.phase = "playing";
  room.game.called = [];
  room.game.turnIndex = 0;
  room.game.nextPlacement = 1;
  room.game.players = room.game.players.map(resetPlayer);
  touchGame(room);
  sendGame(room);
}

function restartGame(room, client) {
  if (client.player?.id !== room.hostId) return;
  if (room.game.phase !== "game-over") return;
  if (room.game.players.some((p) => !p.connected)) return;

  room.game.phase = "playing";
  room.game.called = [];
  room.game.turnIndex = 0;
  room.game.nextPlacement = 1;
  room.game.players = room.game.players.map(resetPlayer);

  for (const player of room.game.players) {
    const board = makeBoard(room.game.count);
    room.boards.set(player.id, board);
    const playerClient = getClientByPlayerId(room, player.id);
    if (playerClient) sendPrivateCard(room, player.id, playerClient.socket);
  }

  touchGame(room);
  sendGame(room);
}

function callNumber(room, client, number) {
  const game = room.game;
  if (game.phase !== "playing") return;
  if (!Number.isInteger(number) || number < 1 || number > game.count) return;
  if (game.called.includes(number)) return;

  const currentPlayer = game.players[game.turnIndex];
  if (!currentPlayer?.active || !currentPlayer.connected) return;
  if (currentPlayer.id !== client.player?.id) return;

  game.called.push(number);
  const called = new Set(game.called);
  const winners = game.players
    .filter((player) => player.active && player.connected)
    .filter((player) => hasBingo(room.boards.get(player.id), called))
    .map((player) => player.id);

  if (winners.length) {
    eliminateWinners(room, winners);
    return;
  }

  game.turnIndex = getNextActiveIndex(game.players, game.turnIndex);
  touchGame(room);
  sendGame(room);
}

function markDisconnected(client) {
  const room = client.room;
  if (!room || !client.player?.id) return;

  const playerId = client.player.id;
  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) return;

  player.connected = false;
  room.clients.delete(client);

  if (room.game.phase === "waiting") {
    touchGame(room);
    broadcast(room, { type: "PLAYER_DISCONNECTED", playerId });
    sendGame(room);
  } else {
    touchGame(room);
    broadcast(room, { type: "PLAYER_DISCONNECTED", playerId });
    sendGame(room);
  }

  client.room = null;
  client.disconnectTimer = setTimeout(() => {
    const currentPlayer = room.game.players.find((p) => p.id === playerId);
    if (!currentPlayer || currentPlayer.connected) return;

    room.boards.delete(playerId);
    room.game.players = room.game.players.filter((p) => p.id !== playerId);

    if (room.game.phase === "playing") {
      if (room.game.players.length === 0) {
        rooms.delete(room.id);
        return;
      }
      if (room.game.turnIndex >= room.game.players.length) room.game.turnIndex = 0;
      if (!room.game.players[room.game.turnIndex]?.active) {
        room.game.turnIndex = getNextActiveIndex(room.game.players, room.game.turnIndex);
      }
      const active = room.game.players.filter((p) => p.active && p.connected);
      if (active.length <= 1) {
        if (active.length === 1) {
          const last = active[0];
          const placement = room.game.nextPlacement;
          last.active = false;
          last.eliminated = true;
          last.placement = placement;
          last.score = calculateScore(room.game.players.length + 1, placement);
        }
        room.game.phase = "game-over";
        room.game.turnIndex = -1;
      }
    }

    touchGame(room);
    broadcast(room, { type: "PLAYER_REMOVED", playerId });
    sendGame(room);
    if (room.game.players.length === 0) rooms.delete(room.id);
  }, RECONNECT_GRACE_MS);
}

wss.on("connection", (socket) => {
  const client = { socket, room: null, player: null, disconnectTimer: null };

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "ERROR", message: "Invalid message." });
      return;
    }

    if (data.type === "CREATE_ROOM") {
      const roomId = String(data.room || "").trim().toUpperCase();
      const player = data.player;
      const board = data.board;
      const count = Number(data.count);

      if (!roomId || !player?.id || !player?.name || ![25, 50, 100].includes(count) || !isValidBoard(board, count)) {
        send(socket, { type: "ERROR", message: "Invalid room data." });
        return;
      }
      if (rooms.has(roomId)) {
        const existingRoom = rooms.get(roomId);
        if (existingRoom.hostId === player.id && existingRoom.game.players.some((p) => p.id === player.id)) {
          if (!addOrReconnectPlayer(existingRoom, player, board, client)) {
            send(socket, { type: "ERROR", message: "Could not reconnect to the room." });
          }
          return;
        }
        send(socket, { type: "ERROR", message: "Room already exists." });
        return;
      }

      const room = {
        id: roomId,
        hostId: player.id,
        clients: new Set([client]),
        boards: new Map([[player.id, board]]),
        game: makeInitialGame(count, player),
      };
      client.room = room;
      client.player = { id: player.id, name: player.name };
      rooms.set(roomId, room);

      send(socket, { type: "ROOM_READY", room: roomId, isHost: true, reconnected: false, game: publicGame(room) });
      sendPrivateCard(room, player.id, socket);
      return;
    }

    if (data.type === "JOIN_ROOM") {
      const roomId = String(data.room || "").trim().toUpperCase();
      const player = data.player;
      const board = data.board;
      if (!roomId || !player?.id || !player?.name || !Array.isArray(board)) {
        send(socket, { type: "ERROR", message: "Invalid join data." });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        send(socket, { type: "ERROR", message: "Room not found." });
        return;
      }

      if (room.game.phase !== "waiting" && !room.game.players.some((p) => p.id === player.id)) {
        send(socket, { type: "ERROR", message: "Game already started." });
        return;
      }

      if (!addOrReconnectPlayer(room, player, board, client)) {
        send(socket, { type: "ERROR", message: "Could not join the room." });
      }
      return;
    }

    const room = client.room;
    if (!room) {
      send(socket, { type: "ERROR", message: "Join a room first." });
      return;
    }

    if (data.type === "START_GAME") {
      startGame(room, client);
      return;
    }
    if (data.type === "CALL_NUMBER") {
      callNumber(room, client, Number(data.number));
      return;
    }
    if (data.type === "RESTART_GAME") {
      restartGame(room, client);
      return;
    }
  });

  socket.on("close", () => markDisconnected(client));
  socket.on("error", () => markDisconnected(client));
});

httpServer.listen(PORT, () => {
  console.log(`LAN Bingo server listening on port ${PORT}`);
});
