import { useEffect, useMemo, useRef, useState } from "react";
import { Peer } from "peerjs";

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
  calculateScore,
  getNextActiveTurnIndex,
  getActivePlayers,
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
  const boardRef = useRef(board);
  const isCoordinatorRef = useRef(false);
  const boardsRef = useRef(new Map());

  gameRef.current = game;
  nameRef.current = name;
  roomRef.current = room;
  boardRef.current = board;

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

  const me = game.players.find(
    (player) => player.id === playerId.current
  );

  const myIndex = game.players.findIndex(
    (player) => player.id === playerId.current
  );

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

  /*
    Clients only report their completed card to the coordinator.
    The coordinator validates it against the stored board.

    Normally the coordinator detects all winners after each number
    is called. CLAIM_BINGO is kept as a fallback for a client that
    finishes after a state update.
  */
  useEffect(() => {
    if (
      game.phase === "playing" &&
      completedLines.length >= 5 &&
      me?.active
    ) {
      sendBingoClaim();
    }
  }, [completedLines.length, game.phase, me?.active]);

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
      players: [
        ...current.players,
        {
          ...player,
          active: true,
          eliminated: false,
          placement: null,
          score: 0,
        },
      ],
    };
  }

  function validateBoard(boardToCheck, called) {
    if (!Array.isArray(boardToCheck)) return false;

    const lines = getCompletedLines(
      boardToCheck,
      new Set(called)
    );

    return lines.length >= 5;
  }

  /*
    This is the important scoring/placement logic.

    If several active players complete Bingo on the same called
    number, they are tied:
      4 players:
      tie for #1 -> both get 30
      next player -> #3 and gets 10
      last -> #4 and gets 0

    In other words, nextPlacement advances by the number of
    players tied at that placement.
  */
  function eliminatePlayers(winnerIds) {
    const current = gameRef.current;

    if (current.phase !== "playing") return;

    const uniqueWinnerIds = [
      ...new Set(winnerIds),
    ].filter((id) => {
      const player = current.players.find(
        (item) => item.id === id
      );

      return Boolean(player?.active);
    });

    if (!uniqueWinnerIds.length) return;

    const placement = current.nextPlacement;
    const score = calculateScore(
      current.players.length,
      placement
    );

    const updatedPlayers = current.players.map(
      (player) =>
        uniqueWinnerIds.includes(player.id)
          ? {
              ...player,
              active: false,
              eliminated: true,
              placement,
              score,
            }
          : player
    );

    const activePlayers = getActivePlayers(updatedPlayers);

    /*
      If exactly one active player remains, they are automatically
      the final remaining player and receive the last placement.
    */
    if (activePlayers.length === 1) {
      const lastPlayer = activePlayers[0];
      const lastPlacement =
        placement + uniqueWinnerIds.length;

      const lastScore = calculateScore(
        current.players.length,
        lastPlacement
      );

      const finalPlayers = updatedPlayers.map(
        (player) =>
          player.id === lastPlayer.id
            ? {
                ...player,
                active: false,
                eliminated: true,
                placement: lastPlacement,
                score: lastScore,
              }
            : player
      );

      const finalGame = {
        ...current,
        phase: "game-over",
        players: finalPlayers,
        nextPlacement: lastPlacement + 1,
        turnIndex: -1,
      };

      broadcastGame(finalGame);
      setWinner(
        uniqueWinnerIds.includes(playerId.current)
      );
      setScreen("game-over");
      return;
    }

    const nextPlacement =
      placement + uniqueWinnerIds.length;

    let nextTurn = current.turnIndex;

    if (!updatedPlayers[current.turnIndex]?.active) {
      nextTurn = getNextActiveTurnIndex(
        updatedPlayers,
        current.turnIndex
      );
    }

    const nextGame = {
      ...current,
      players: updatedPlayers,
      nextPlacement,
      turnIndex: nextTurn,
    };

    broadcastGame(nextGame);

    if (uniqueWinnerIds.includes(playerId.current)) {
      setWinner(true);
    }
  }

  /*
    After a number is called, inspect every player's stored card.
    This catches simultaneous Bingo on the same call and creates
    a real tie instead of relying on network message arrival order.
  */
  function detectBingosAfterCall(nextCalled) {
    const current = gameRef.current;

    const winners = current.players
      .filter((player) => player.active)
      .filter((player) => {
        const playerBoard = boardsRef.current.get(
          player.id
        );

        return validateBoard(
          playerBoard,
          nextCalled
        );
      })
      .map((player) => player.id);

    if (winners.length) {
      eliminatePlayers(winners);
    }
  }

  function handleMessage(message, connection) {
    if (!message) return;

    if (message.type === "JOIN") {
      if (!isCoordinatorRef.current) return;
      if (gameRef.current.phase !== "waiting") return;

      const nextGame = addPlayer(message.player);

      if (message.board?.length) {
        boardsRef.current.set(
          message.player.id,
          message.board
        );
      }

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

    if (message.type === "UPDATE_BOARD") {
      if (!isCoordinatorRef.current) return;

      if (!message.playerId || !Array.isArray(message.board)) {
        return;
      }

      /*
        Boards are only stored by the coordinator. They are never
        placed into GAME_STATE, so other players do not receive
        everyone's cards.
      */
      boardsRef.current.set(
        message.playerId,
        message.board
      );

      /*
        A player may finish a line immediately after receiving a
        GAME_STATE. Check here as well.
      */
      if (gameRef.current.phase === "playing") {
        const player = gameRef.current.players.find(
          (item) => item.id === message.playerId
        );

        if (player?.active) {
          const isBingo = validateBoard(
            message.board,
            gameRef.current.called
          );

          if (isBingo) {
            eliminatePlayers([message.playerId]);
          }
        }
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

        if (incoming.phase === "game-over") {
          setWinner(false);
          setScreen("game-over");
        } else if (incoming.phase === "playing") {
          setScreen("game");
        } else {
          setScreen("waiting");
        }
      }

      return;
    }

    if (message.type === "START_GAME") {
      if (!isCoordinatorRef.current) return;

      const current = gameRef.current;

      if (current.players.length < 2) {
        notify("You need at least 2 players.");
        return;
      }

      const nextGame = {
        ...current,
        phase: "playing",
        called: [],
        turnIndex: 0,
        nextPlacement: 1,
        players: current.players.map((player) => ({
          ...player,
          active: true,
          eliminated: false,
          placement: null,
          score: 0,
        })),
      };

      broadcastGame(nextGame);
      setWinner(false);
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

      if (!player?.active) return;
      if (player.id !== message.playerId) return;

      const nextCalled = [
        ...current.called,
        number,
      ];

      const nextTurn = getNextActiveTurnIndex(
        current.players,
        current.turnIndex
      );

      if (nextTurn === -1) return;

      const nextGame = {
        ...current,
        called: nextCalled,
        turnIndex: nextTurn,
      };

      broadcastGame(nextGame);

      /*
        Use the newly called number to determine whether one or
        more active players just completed Bingo.
      */
      detectBingosAfterCall(nextCalled);
      return;
    }

    if (message.type === "CLAIM_BINGO") {
      if (!isCoordinatorRef.current) return;

      const player = gameRef.current.players.find(
        (item) => item.id === message.playerId
      );

      if (!player?.active) return;

      const playerBoard = boardsRef.current.get(
        message.playerId
      );

      if (
        validateBoard(
          playerBoard,
          gameRef.current.called
        )
      ) {
        eliminatePlayers([message.playerId]);
      }

      return;
    }

    if (message.type === "RESTART_GAME") {
      if (!isCoordinatorRef.current) return;

      restartGame();
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
          board: boardRef.current,
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
      connectionsRef.current.delete(
        connection.peer
      );
    });

    connection.on("error", () => {
      connectionsRef.current.delete(
        connection.peer
      );
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
    boardRef.current = finalBoard;

    const newRoom = createRoomCode();

    setRoom(newRoom);
    roomRef.current = newRoom;
    nameRef.current = name.trim();

    destroyPeer();
    boardsRef.current.clear();

    isCoordinatorRef.current = false;
    setConnectionStatus("connecting");

    const coordinatorId =
      `bingo-${newRoom}-coordinator`;

    const peer = new Peer(coordinatorId);

    peerRef.current = peer;

    peer.on("open", () => {
      isCoordinatorRef.current = true;

      const mePlayer = {
        id: playerId.current,
        name: nameRef.current,
      };

      boardsRef.current.set(
        playerId.current,
        finalBoard
      );

      const newGame = makeGame(
        count,
        mePlayer
      );

      updateGame(newGame);
      setConnectionStatus("connected");
      setScreen("waiting");
    });

    peer.on("connection", (connection) => {
      setupRoutedConnection(connection);
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
    boardRef.current = finalBoard;

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

      setupRoutedConnection(connection);
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
    if (eliminated) {
      notify("You are out of the game.");
      return;
    }

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

  function sendBingoClaim() {
    if (!me?.active) return;
    if (completedLines.length < 5) return;

    const message = {
      type: "CLAIM_BINGO",
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
    const newBoard = shuffle(numbersFor(count));
    setBoard(newBoard);
    boardRef.current = newBoard;
  }

  function toggleManualNumber(number) {
    setBoard((previous) => {
      if (previous.includes(number)) {
        const next = previous.filter(
          (n) => n !== number
        );
        boardRef.current = next;
        return next;
      }

      if (previous.length >= count) {
        return previous;
      }

      const next = [...previous, number];
      boardRef.current = next;
      return next;
    });
  }

  function restartGame() {
    if (!isCoordinatorRef.current) return;

    const current = gameRef.current;

    const resetPlayers = current.players.map(
      (player) => ({
        ...player,
        active: true,
        eliminated: false,
        placement: null,
        score: 0,
      })
    );

    const coordinatorBoard =
      shuffle(numbersFor(current.count));

    boardsRef.current.clear();
    boardsRef.current.set(
      playerId.current,
      coordinatorBoard
    );

    setBoard(coordinatorBoard);
    boardRef.current = coordinatorBoard;

    const nextGame = {
      ...current,
      phase: "playing",
      called: [],
      turnIndex: 0,
      nextPlacement: 1,
      players: resetPlayers,
    };

    broadcastGame(nextGame);

    sendToEveryone({
      type: "NEW_CARDS",
      count: current.count,
    });

    setWinner(false);
    setScreen("game");
  }

  function routeMessage(message, connection) {
    if (message?.type === "NEW_CARDS") {
      const newBoard = shuffle(
        numbersFor(message.count)
      );

      setBoard(newBoard);
      boardRef.current = newBoard;
      setWinner(false);
      setScreen("game");

      /*
        Send the new card to the coordinator so it can validate
        future Bingo claims.
      */
      const coordinator =
        connectionsRef.current.values().next().value;

      if (coordinator?.open) {
        coordinator.send(
          JSON.stringify({
            type: "UPDATE_BOARD",
            playerId: playerId.current,
            board: newBoard,
          })
        );
      }

      return;
    }

    handleMessage(message, connection);
  }

  /*
    Replace the data listener's route only by wrapping setup once.
    This keeps all message types in one place.
  */
  function setupRoutedConnection(connection) {
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
          board: boardRef.current,
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

        routeMessage(message, connection);
      } catch {
        // Ignore malformed messages.
      }
    });

    connection.on("close", () => {
      connectionsRef.current.delete(
        connection.peer
      );
    });

    connection.on("error", () => {
      connectionsRef.current.delete(
        connection.peer
      );
    });
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

  if (screen === "game-over") {
    return (
      <>
        <GameOverScreen
          game={game}
          playerId={playerId.current}
          isCoordinator={isCoordinatorRef.current}
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

  function leaveGame() {
    destroyPeer();

    isCoordinatorRef.current = false;
    boardsRef.current.clear();

    setConnectionStatus("offline");
    setRoom("");
    setBoard([]);
    boardRef.current = [];
    setWinner(false);

    setGame(
      makeGame(25, {
        id: playerId.current,
        name: "",
      })
    );

    setScreen("home");
  }
}