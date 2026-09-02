import { useEffect, useMemo, useRef, useState } from "react";
import HomeScreen from "./components/HomeScreen";
import WaitingRoom from "./components/WaitingRoom";
import GameScreen from "./components/GameScreen";
import GameOverScreen from "./components/GameOverScreen";
import Toast from "./components/Toast";

import {
  createRoomCode,
  getCompletedLines,
  makeGame,
  numbersFor,
  shuffle,
} from "./utils/bingo";
import { getPlayerId } from "./utils/player";

export default function App() {
  const playerId = useRef(getPlayerId());

  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [count, setCount] = useState(25);
  const [mode, setMode] = useState("random");
  const [board, setBoard] = useState([]);
  const [game, setGame] = useState(
    makeGame(25, { id: playerId.current, name: "" })
  );
  const [notice, setNotice] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [winner, setWinner] = useState(false);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const shouldReconnectRef = useRef(false);
  const sessionRef = useRef(null);
  const gameRef = useRef(game);
  const boardRef = useRef(board);
  const nameRef = useRef(name);
  const roomRef = useRef(room);
  const isHostRef = useRef(false);

  const serverUrl =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:10000`;

  gameRef.current = game;
  boardRef.current = board;
  nameRef.current = name;
  roomRef.current = room;

  const calledSet = useMemo(() => new Set(game.called), [game.called]);

  const completedLines = useMemo(
    () => getCompletedLines(board, calledSet),
    [board, calledSet]
  );

  const completedCells = useMemo(() => {
    const result = new Set();
    completedLines.forEach((line) => line.forEach((index) => result.add(index)));
    return result;
  }, [completedLines]);

  const me = game.players.find((player) => player.id === playerId.current);
  const myIndex = game.players.findIndex((player) => player.id === playerId.current);
  const currentPlayer = game.players[game.turnIndex];

  const myTurn =
    game.phase === "playing" &&
    Boolean(me?.active) &&
    myIndex !== -1 &&
    myIndex === game.turnIndex;

  const eliminated = Boolean(me && !me.active);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const saved = localStorage.getItem("lan-bingo-session");
    if (!saved) return;

    try {
      const session = JSON.parse(saved);
      if (!session?.room || !session?.name || !session?.playerId) return;
      sessionRef.current = session;
      setName(session.name);
      setRoom(session.room);
      setConnectionStatus("connecting");
      setScreen("waiting");
      shouldReconnectRef.current = true;
      connectToServer({
        roomCode: session.room,
        host: session.isHost,
        player: { id: session.playerId, name: session.name },
        finalBoard: session.board || [],
      });
    } catch {
      localStorage.removeItem("lan-bingo-session");
    }

    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      try {
        socketRef.current?.close();
      } catch {}
    };
  }, []);

  function notify(message) {
    setNotice(message);
  }

  function updateGame(nextGame) {
    const incomingVersion = Number(nextGame?.version || 0);
    const currentVersion = Number(gameRef.current?.version || 0);
    if (incomingVersion < currentVersion) return;

    gameRef.current = nextGame;
    setGame(nextGame);
    setCount(nextGame.count);

    if (nextGame.phase === "game-over") {
      setScreen("game-over");
    } else if (nextGame.phase === "playing") {
      setScreen("game");
    } else {
      setScreen("waiting");
    }
  }

  function send(message) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      notify("Not connected to the server.");
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function handleMessage(message) {
    if (!message) return;

    if (message.type === "ROOM_READY") {
      setConnectionStatus("connected");
      if (message.game) updateGame(message.game);
      const session = {
        room: message.room || roomRef.current,
        name: nameRef.current,
        playerId: playerId.current,
        isHost: Boolean(message.isHost),
        board: boardRef.current,
      };
      sessionRef.current = session;
      localStorage.setItem("lan-bingo-session", JSON.stringify(session));
      return;
    }

    if (message.type === "ERROR") {
      setConnectionStatus("offline");
      shouldReconnectRef.current = false;
      notify(message.message || "Server error.");
      return;
    }

    if (message.type === "GAME_STATE") {
      if (!message.game) return;
      updateGame(message.game);
      setConnectionStatus("connected");

      const meInGame = message.game.players.find(
        (player) => player.id === playerId.current
      );
      if (meInGame && !meInGame.active) {
        setWinner(true);
      }
      return;
    }

    if (message.type === "NEW_CARD") {
      if (!Array.isArray(message.board)) return;
      setBoard(message.board);
      boardRef.current = message.board;
      if (sessionRef.current) {
        sessionRef.current.board = message.board;
        localStorage.setItem("lan-bingo-session", JSON.stringify(sessionRef.current));
      }
      setWinner(false);
      return;
    }

    if (message.type === "PLAYER_DISCONNECTED") {
      if (message.playerId) notify("A player left the room.");
      return;
    }
  }

  function connectToServer({ roomCode, host, player, finalBoard }) {
    clearTimeout(reconnectTimerRef.current);
    shouldReconnectRef.current = true;

    const socket = new WebSocket(serverUrl);
    socketRef.current = socket;
    isHostRef.current = host;
    setConnectionStatus("connecting");

    socket.onopen = () => {
      setConnectionStatus("connected");
      socket.send(
        JSON.stringify({
          type: host ? "CREATE_ROOM" : "JOIN_ROOM",
          room: roomCode,
          player,
          board: finalBoard,
          count,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch {
        // Ignore malformed messages.
      }
    };

    socket.onerror = () => {
      setConnectionStatus("reconnecting");
    };

    socket.onclose = () => {
      if (!shouldReconnectRef.current || !roomRef.current) {
        setConnectionStatus("offline");
        return;
      }

      setConnectionStatus("reconnecting");
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        const session = sessionRef.current;
        if (!session?.room) return;
        connectToServer({
          roomCode: session.room,
          host: session.isHost,
          player: { id: session.playerId, name: session.name },
          finalBoard: session.board || [],
        });
      }, 1500);
    };
  }

  function destroySocket() {
    shouldReconnectRef.current = false;
    clearTimeout(reconnectTimerRef.current);
    try {
      socketRef.current?.close();
    } catch {}
    socketRef.current = null;
  }

  function createGame() {
    if (!name.trim()) {
      notify("Enter your name first.");
      return;
    }

    if (mode === "manual" && board.length !== count) {
      notify(`Select exactly ${count} numbers.`);
      return;
    }

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    const newRoom = createRoomCode();
    const cleanName = name.trim();
    const player = { id: playerId.current, name: cleanName };
    const initialGame = makeGame(count, player);

    setBoard(finalBoard);
    boardRef.current = finalBoard;
    setRoom(newRoom);
    roomRef.current = newRoom;
    setName(cleanName);
    nameRef.current = cleanName;
    setGame(initialGame);
    gameRef.current = initialGame;
    setWinner(false);
    setConnectionStatus("connecting");
    setScreen("waiting");
    sessionRef.current = {
      room: newRoom,
      name: cleanName,
      playerId: playerId.current,
      isHost: true,
      board: finalBoard,
    };
    localStorage.setItem("lan-bingo-session", JSON.stringify(sessionRef.current));

    destroySocket();
    connectToServer({
      roomCode: newRoom,
      host: true,
      player,
      finalBoard,
    });
  }

  function joinGame() {
    if (!name.trim()) {
      notify("Enter your name first.");
      return;
    }

    if (!room.trim()) {
      notify("Enter the room code.");
      return;
    }

    if (mode === "manual" && board.length !== count) {
      notify(`Select exactly ${count} numbers.`);
      return;
    }

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    const roomCode = room.trim().toUpperCase();
    const cleanName = name.trim();
    const player = { id: playerId.current, name: cleanName };

    setBoard(finalBoard);
    boardRef.current = finalBoard;
    setRoom(roomCode);
    roomRef.current = roomCode;
    setName(cleanName);
    nameRef.current = cleanName;
    setConnectionStatus("connecting");
    setScreen("waiting");
    sessionRef.current = {
      room: roomCode,
      name: cleanName,
      playerId: playerId.current,
      isHost: false,
      board: finalBoard,
    };
    localStorage.setItem("lan-bingo-session", JSON.stringify(sessionRef.current));

    destroySocket();
    connectToServer({
      roomCode,
      host: false,
      player,
      finalBoard,
    });
  }

  function startBingo() {
    if (!isHostRef.current) return;
    if (game.players.length < 2) {
      notify("You need at least 2 players.");
      return;
    }
    send({ type: "START_GAME" });
  }

  function selectNumber(number) {
    if (eliminated) {
      notify("You are out of the game.");
      return;
    }

    if (!myTurn) {
      notify(`Wait for ${currentPlayer?.name || "the current player"}.`);
      return;
    }

    if (game.called.includes(number)) return;
    send({ type: "CALL_NUMBER", number });
  }

  function randomizeCard() {
    const newBoard = shuffle(numbersFor(count));
    setBoard(newBoard);
    boardRef.current = newBoard;
  }

  function toggleManualNumber(number) {
    setBoard((previous) => {
      if (previous.includes(number)) {
        const next = previous.filter((n) => n !== number);
        boardRef.current = next;
        return next;
      }

      if (previous.length >= count) return previous;

      const next = [...previous, number];
      boardRef.current = next;
      return next;
    });
  }

  function restartGame() {
    if (!isHostRef.current) return;
    send({ type: "RESTART_GAME" });
  }

  function leaveGame() {
    destroySocket();
    localStorage.removeItem("lan-bingo-session");
    sessionRef.current = null;
    isHostRef.current = false;
    setConnectionStatus("offline");
    setRoom("");
    setBoard([]);
    boardRef.current = [];
    setWinner(false);
    setGame(makeGame(25, { id: playerId.current, name: "" }));
    setScreen("home");
  }

  if (screen === "home") {
    return (
      <div className="app">
        <HomeScreen
          name={name}
          setName={setName}
          room={room}
          setRoom={setRoom}
          count={count}
          setCount={setCount}
          mode={mode}
          setMode={setMode}
          board={board}
          setBoard={setBoard}
          onRandomize={randomizeCard}
          onToggleManual={toggleManualNumber}
          onCreate={createGame}
          onJoin={joinGame}
        />
        <Toast message={notice} />
      </div>
    );
  }

  if (screen === "waiting") {
    return (
      <>
        <WaitingRoom
          room={room}
          game={game}
          playerId={playerId.current}
          connectionStatus={connectionStatus}
          isCoordinator={isHostRef.current}
          onStart={startBingo}
          onLeave={leaveGame}
        />
        <Toast message={notice} />
      </>
    );
  }

  if (screen === "game-over") {
    return (
      <>
        <GameOverScreen
          game={game}
          playerId={playerId.current}
          isCoordinator={isHostRef.current}
          onRestart={restartGame}
          onLeave={leaveGame}
        />
        <Toast message={notice} />
      </>
    );
  }

  return (
    <>
      <GameScreen
        room={room}
        game={game}
        playerId={playerId.current}
        name={name}
        connectionStatus={connectionStatus}
        board={board}
        calledSet={calledSet}
        completedLines={completedLines}
        completedCells={completedCells}
        myTurn={myTurn}
        eliminated={eliminated}
        onSelectNumber={selectNumber}
        onLeave={leaveGame}
        winner={winner}
        onCloseWinner={() => setWinner(false)}
      />
      <Toast message={notice} />
    </>
  );
}
