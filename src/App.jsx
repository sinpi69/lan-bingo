import { useEffect, useMemo, useRef, useState } from "react";
import { Peer } from "peerjs";

import HomeScreen from "./components/HomeScreen";
import WaitingRoom from "./components/WaitingRoom";
import GameScreen from "./components/GameScreen";
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
    makeGame(25, {
      id: playerId.current,
      name: "",
    })
  );

  const [notice, setNotice] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [winner, setWinner] = useState(false);

  const peerRef = useRef(null);
  const connectionsRef = useRef(new Map());
  const gameRef = useRef(game);
  const nameRef = useRef(name);
  const roomRef = useRef(room);
  const isCoordinatorRef = useRef(false);

  gameRef.current = game;
  nameRef.current = name;
  roomRef.current = room;

  const calledSet = useMemo(
    () => new Set(game.called),
    [game.called]
  );

  const completedLines = useMemo(
    () => getCompletedLines(board, calledSet),
    [board, calledSet]
  );

  const completedCells = useMemo(() => {
    const result = new Set();

    completedLines.forEach((line) => {
      line.forEach((index) => result.add(index));
    });

    return result;
  }, [completedLines]);

  const myIndex = game.players.findIndex(
    (player) => player.id === playerId.current
  );

  const currentPlayer = game.players[game.turnIndex];

  const myTurn =
    game.phase === "playing" &&
    myIndex !== -1 &&
    myIndex === game.turnIndex;

  useEffect(() => {
    if (!notice) return;

    const timeout = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (
      game.phase === "playing" &&
      completedLines.length >= 5
    ) {
      setWinner(true);
    }
  }, [completedLines.length, game.phase]);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((connection) => {
        try {
          connection.close();
        } catch {}
      });

      try {
        peerRef.current?.destroy();
      } catch {}
    };
  }, []);

  function notify(message) {
    setNotice(message);
  }

  function updateGame(nextGame) {
    gameRef.current = nextGame;
    setGame(nextGame);
  }

  function sendToEveryone(message) {
    const data = JSON.stringify(message);

    connectionsRef.current.forEach((connection) => {
      if (!connection.open) return;

      try {
        connection.send(data);
      } catch {}
    });
  }

  function broadcastGame(nextGame) {
    const currentVersion = Number(
      gameRef.current.version || 0
    );

    const finalGame = {
      ...nextGame,
      version: Math.max(
        Number(nextGame.version || 0),
        currentVersion + 1
      ),
    };

    updateGame(finalGame);

    sendToEveryone({
      type: "GAME_STATE",
      game: finalGame,
    });
  }

  function addPlayer(player) {
    const current = gameRef.current;

    if (
      current.players.some(
        (existing) => existing.id === player.id
      )
    ) {
      return current;
    }

    return {
      ...current,
      players: [...current.players, player],
    };
  }

  function handleMessage(message, connection) {
    if (!message) return;

    if (message.type === "JOIN") {
      if (!isCoordinatorRef.current) return;

      const nextGame = addPlayer(message.player);

      if (connection?.open) {
        connection.send(
          JSON.stringify({
            type: "GAME_STATE",
            game: nextGame,
          })
        );
      }

      broadcastGame(nextGame);
      return;
    }

    if (message.type === "REQUEST_GAME") {
      if (!isCoordinatorRef.current) return;

      if (connection?.open) {
        connection.send(
          JSON.stringify({
            type: "GAME_STATE",
            game: gameRef.current,
          })
        );
      }

      return;
    }

    if (message.type === "GAME_STATE") {
      const incoming = message.game;
      if (!incoming) return;

      const currentVersion = Number(
        gameRef.current.version || 0
      );

      const incomingVersion = Number(
        incoming.version || 0
      );

      if (incomingVersion >= currentVersion) {
        updateGame(incoming);
        setCount(incoming.count);
        setConnectionStatus("connected");

        setScreen(
          incoming.phase === "playing"
            ? "game"
            : "waiting"
        );
      }

      return;
    }

    if (message.type === "START_GAME") {
      if (!isCoordinatorRef.current) return;

      const current = gameRef.current;

      if (current.players.length < 2) {
        notify("Wait for at least one more player.");
        return;
      }

      const nextGame = {
        ...current,
        phase: "playing",
        called: [],
        turnIndex: 0,
      };

      broadcastGame(nextGame);
      setScreen("game");
      return;
    }

    if (message.type === "CALL_NUMBER") {
      if (!isCoordinatorRef.current) return;

      const current = gameRef.current;

      if (current.phase !== "playing") return;

      const number = Number(message.number);

      if (
        number < 1 ||
        number > current.count ||
        !Number.isInteger(number)
      ) {
        return;
      }

      if (current.called.includes(number)) return;

      const player = current.players[current.turnIndex];

      if (!player) return;

      if (player.id !== message.playerId) return;

      const nextTurn = current.players.length
        ? (current.turnIndex + 1) %
          current.players.length
        : 0;

      const nextGame = {
        ...current,
        called: [...current.called, number],
        turnIndex: nextTurn,
      };

      broadcastGame(nextGame);
    }
  }

  function setupConnection(connection) {
    connectionsRef.current.set(
      connection.peer,
      connection
    );

    connection.on("open", () => {
      setConnectionStatus("connected");

      connection.send(
        JSON.stringify({
          type: "JOIN",
          player: {
            id: playerId.current,
            name: nameRef.current.trim(),
          },
        })
      );

      connection.send(
        JSON.stringify({
          type: "REQUEST_GAME",
        })
      );
    });

    connection.on("data", (data) => {
      try {
        const message =
          typeof data === "string"
            ? JSON.parse(data)
            : data;

        handleMessage(message, connection);
      } catch {
        // Ignore malformed messages.
      }
    });

    connection.on("close", () => {
      connectionsRef.current.delete(connection.peer);
    });

    connection.on("error", () => {
      connectionsRef.current.delete(connection.peer);
    });
  }

  function destroyPeer() {
    connectionsRef.current.forEach((connection) => {
      try {
        connection.close();
      } catch {}
    });

    connectionsRef.current.clear();

    try {
      peerRef.current?.destroy();
    } catch {}

    peerRef.current = null;
  }

  function createGame() {
    if (!name.trim()) {
      notify("Enter your name first.");
      return;
    }

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(`Select exactly ${count} numbers.`);
      return;
    }

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    setBoard(finalBoard);

    const newRoom = createRoomCode();

    setRoom(newRoom);
    roomRef.current = newRoom;
    nameRef.current = name.trim();

    destroyPeer();

    isCoordinatorRef.current = false;
    setConnectionStatus("connecting");

    const coordinatorId =
      `bingo-${newRoom}-coordinator`;

    const peer = new Peer(coordinatorId);

    peerRef.current = peer;

    peer.on("open", () => {
      isCoordinatorRef.current = true;

      const me = {
        id: playerId.current,
        name: nameRef.current,
      };

      const newGame = makeGame(count, me);

      updateGame(newGame);
      setConnectionStatus("connected");
      setScreen("waiting");
    });

    peer.on("connection", (connection) => {
      setupConnection(connection);
    });

    peer.on("error", (error) => {
      console.error(error);
      setConnectionStatus("offline");
      notify("Could not create the room.");
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

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(`Select exactly ${count} numbers.`);
      return;
    }

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    setBoard(finalBoard);

    const roomCode = room.trim().toUpperCase();

    setRoom(roomCode);
    roomRef.current = roomCode;
    nameRef.current = name.trim();

    destroyPeer();

    isCoordinatorRef.current = false;
    setConnectionStatus("connecting");

    const myPeerId =
      `bingo-${roomCode}-${playerId.current}`;

    const peer = new Peer(myPeerId);

    peerRef.current = peer;

    peer.on("open", () => {
      const connection = peer.connect(
        `bingo-${roomCode}-coordinator`,
        { reliable: true }
      );

      setupConnection(connection);
      setScreen("waiting");
    });

    peer.on("error", (error) => {
      console.error(error);
      setConnectionStatus("offline");
      notify(
        "Could not join the room. Check the room code."
      );
    });
  }

  function startBingo() {
    if (!isCoordinatorRef.current) return;

    if (game.players.length < 2) {
      notify("You need at least 2 players.");
      return;
    }

    handleMessage({
      type: "START_GAME",
    });
  }

  function selectNumber(number) {
    if (!myTurn) {
      notify(
        `Wait for ${
          currentPlayer?.name || "the current player"
        }.`
      );
      return;
    }

    if (game.called.includes(number)) return;

    const message = {
      type: "CALL_NUMBER",
      number,
      playerId: playerId.current,
    };

    if (isCoordinatorRef.current) {
      handleMessage(message);
      return;
    }

    connectionsRef.current.forEach((connection) => {
      if (!connection.open) return;

      try {
        connection.send(JSON.stringify(message));
      } catch {}
    });
  }

  function randomizeCard() {
    setBoard(shuffle(numbersFor(count)));
  }

  function toggleManualNumber(number) {
    setBoard((previous) => {
      if (previous.includes(number)) {
        return previous.filter((n) => n !== number);
      }

      if (previous.length >= count) {
        return previous;
      }

      return [...previous, number];
    });
  }

  function leaveGame() {
    destroyPeer();

    isCoordinatorRef.current = false;

    setConnectionStatus("offline");
    setRoom("");
    setBoard([]);
    setWinner(false);

    setGame(
      makeGame(25, {
        id: playerId.current,
        name: "",
      })
    );

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
          isCoordinator={isCoordinatorRef.current}
          onStart={startBingo}
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
        onSelectNumber={selectNumber}
        onLeave={leaveGame}
        winner={winner}
        onCloseWinner={() => setWinner(false)}
      />

      <Toast message={notice} />
    </>
  );
}