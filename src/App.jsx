import { useEffect, useMemo, useRef, useState } from "react";
import { Peer } from "peerjs";
import "./App.css";

const PLAYER_ID_KEY = "lan-bingo-player-id";
const LETTERS = ["B", "I", "N", "G", "O"];

function getPlayerId() {
  let id = sessionStorage.getItem(PLAYER_ID_KEY);

  if (!id) {
    id =
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-5);

    sessionStorage.setItem(PLAYER_ID_KEY, id);
  }

  return id;
}

function numbersFor(count) {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function createRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();
}

function getCompletedLines(board, called) {
  if (!board.length) return [];

  const size = Math.sqrt(board.length);

  if (!Number.isInteger(size)) return [];

  const lines = [];

  // Horizontal
  for (let row = 0; row < size; row++) {
    const line = [];

    for (let col = 0; col < size; col++) {
      line.push(row * size + col);
    }

    if (line.every(index => called.has(board[index]))) {
      lines.push(line);
    }
  }

  // Vertical
  for (let col = 0; col < size; col++) {
    const line = [];

    for (let row = 0; row < size; row++) {
      line.push(row * size + col);
    }

    if (line.every(index => called.has(board[index]))) {
      lines.push(line);
    }
  }

  // Diagonal \
  const diagonal1 = [];

  for (let i = 0; i < size; i++) {
    diagonal1.push(i * size + i);
  }

  if (diagonal1.every(index => called.has(board[index]))) {
    lines.push(diagonal1);
  }

  // Diagonal /
  const diagonal2 = [];

  for (let i = 0; i < size; i++) {
    diagonal2.push(i * size + (size - 1 - i));
  }

  if (diagonal2.every(index => called.has(board[index]))) {
    lines.push(diagonal2);
  }

  return lines;
}

function makeInitialGame(count, player) {
  return {
    version: 1,
    count,
    called: [],
    players: [player],
    turnIndex: 0,
  };
}

export default function App() {
  const playerId = useRef(getPlayerId());

  const [screen, setScreen] = useState("home");

  const [name, setName] = useState("");
  const [room, setRoom] = useState("");

  const [count, setCount] = useState(25);

  const [mode, setMode] = useState("random");

  const [board, setBoard] = useState([]);

  const [game, setGame] = useState(
    makeInitialGame(25, {
      id: playerId.current,
      name: "",
    })
  );

  const [notice, setNotice] = useState("");

  const [connectionStatus, setConnectionStatus] =
    useState("offline");

  const [winner, setWinner] = useState(false);

  const peerRef = useRef(null);

  const connectionsRef = useRef(new Map());

  const gameRef = useRef(game);

  const nameRef = useRef(name);

  const roomRef = useRef(room);

  const isCoordinatorRef = useRef(false);

  const connectingRef = useRef(false);

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

    completedLines.forEach(line => {
      line.forEach(index => result.add(index));
    });

    return result;
  }, [completedLines]);

  const myIndex = game.players.findIndex(
    player => player.id === playerId.current
  );

  const currentPlayer =
    game.players[game.turnIndex];

  const myTurn =
    myIndex !== -1 &&
    myIndex === game.turnIndex;

  const boardSize = count === 25 ? 5 : 10;

  useEffect(() => {
    if (!notice) return;

    const timeout = setTimeout(() => {
      setNotice("");
    }, 2500);

    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (completedLines.length >= 5) {
      setWinner(true);
    }
  }, [completedLines.length]);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(connection => {
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

    connectionsRef.current.forEach(connection => {
      if (connection.open) {
        try {
          connection.send(data);
        } catch {}
      }
    });
  }

  function broadcastGame(nextGame) {
    const currentVersion =
      Number(gameRef.current.version || 0);

    const nextVersion =
      Math.max(
        Number(nextGame.version || 0),
        currentVersion + 1
      );

    const finalGame = {
      ...nextGame,
      version: nextVersion,
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
        existing => existing.id === player.id
      )
    ) {
      return current;
    }

    return {
      ...current,
      players: [
        ...current.players,
        player,
      ],
    };
  }

  function handleMessage(message, connection) {
    if (!message) return;

    /*
    --------------------------------------------------------
    PLAYER JOINED
    --------------------------------------------------------
    */

    if (message.type === "JOIN") {
      if (!isCoordinatorRef.current) return;

      const nextGame = addPlayer(
        message.player
      );

      broadcastGame(nextGame);

      if (connection?.open) {
        connection.send(
          JSON.stringify({
            type: "GAME_STATE",
            game: nextGame,
          })
        );
      }

      return;
    }

    /*
    --------------------------------------------------------
    REQUEST CURRENT GAME
    --------------------------------------------------------
    */

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

    /*
    --------------------------------------------------------
    GAME STATE
    --------------------------------------------------------
    */

    if (message.type === "GAME_STATE") {
      const incoming = message.game;

      if (!incoming) return;

      const currentVersion =
        Number(gameRef.current.version || 0);

      const incomingVersion =
        Number(incoming.version || 0);

      if (incomingVersion >= currentVersion) {
        updateGame(incoming);

        setCount(incoming.count);

        setConnectionStatus("connected");

        setScreen("game");
      }

      return;
    }

    /*
    --------------------------------------------------------
    NUMBER CALL
    --------------------------------------------------------
    */

    if (message.type === "CALL_NUMBER") {
      if (!isCoordinatorRef.current) return;

      const current = gameRef.current;

      const number = Number(message.number);

      /*
      Make sure:
      - number is valid
      - number wasn't already selected
      - it really is that player's turn
      */

      if (
        number < 1 ||
        number > current.count
      ) {
        return;
      }

      if (current.called.includes(number)) {
        return;
      }

      const player =
        current.players[current.turnIndex];

      if (!player) return;

      if (
        player.id !==
        message.playerId
      ) {
        return;
      }

      const nextTurn =
        current.players.length > 0
          ? (current.turnIndex + 1) %
            current.players.length
          : 0;

      const nextGame = {
        ...current,

        called: [
          ...current.called,
          number,
        ],

        turnIndex: nextTurn,
      };

      broadcastGame(nextGame);

      return;
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

    connection.on("data", data => {
      try {
        const message =
          typeof data === "string"
            ? JSON.parse(data)
            : data;

        handleMessage(
          message,
          connection
        );
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
    connectionsRef.current.forEach(
      connection => {
        try {
          connection.close();
        } catch {}
      }
    );

    connectionsRef.current.clear();

    try {
      peerRef.current?.destroy();
    } catch {}

    peerRef.current = null;
  }

  /*
  ==========================================================
  CREATE ROOM
  ==========================================================
  */

  async function createGame() {
    if (!name.trim()) {
      notify("Enter your name first.");
      return;
    }

    /*
    IMPORTANT:

    Creating a game does NOT randomize the board here.

    The board is already generated when the player chooses
    Randomize or when manual selection is completed.
    */

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(
        `Select exactly ${count} numbers first.`
      );

      return;
    }

    /*
    If random mode has no board yet,
    generate it ONCE.
    */

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    setBoard(finalBoard);

    const newRoom =
      createRoomCode();

    setRoom(newRoom);

    roomRef.current = newRoom;

    nameRef.current =
      name.trim();

    destroyPeer();

    setConnectionStatus(
      "connecting"
    );

    /*
    The room coordinator is only used for
    PeerJS discovery/signaling.

    It is NOT a game host.

    Turns still rotate between every player.
    */

    const coordinatorId =
      `bingo-${newRoom}-coordinator`;

    const peer =
      new Peer(coordinatorId);

    peerRef.current = peer;

    peer.on("open", () => {
      isCoordinatorRef.current =
        true;

      const me = {
        id: playerId.current,
        name: name.trim(),
      };

      const newGame =
        makeInitialGame(
          count,
          me
        );

      updateGame(newGame);

      setConnectionStatus(
        "connected"
      );

      /*
      Go directly to the game.

      DO NOT shuffle again.
      */

      setScreen("game");
    });

    peer.on("connection", connection => {
      setupConnection(connection);
    });

    peer.on("error", error => {
      console.error(error);

      setConnectionStatus(
        "offline"
      );

      notify(
        "Could not create the room."
      );
    });
  }

  /*
  ==========================================================
  JOIN ROOM
  ==========================================================
  */

  async function joinGame() {
    if (!name.trim()) {
      notify("Enter your name first.");
      return;
    }

    if (!room.trim()) {
      notify("Enter a room code.");
      return;
    }

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(
        `Select exactly ${count} numbers first.`
      );

      return;
    }

    /*
    Each player gets their own card.

    Joining does NOT change the card again.
    */

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(numbersFor(count))
        : board;

    setBoard(finalBoard);

    const roomCode =
      room.trim().toUpperCase();

    setRoom(roomCode);

    roomRef.current =
      roomCode;

    nameRef.current =
      name.trim();

    destroyPeer();

    setConnectionStatus(
      "connecting"
    );

    const myPeerId =
      `bingo-${roomCode}-${playerId.current}`;

    const peer =
      new Peer(myPeerId);

    peerRef.current = peer;

    peer.on("open", () => {
      const connection =
        peer.connect(
          `bingo-${roomCode}-coordinator`,
          {
            reliable: true,
          }
        );

      setupConnection(
        connection
      );
    });

    peer.on("error", error => {
      console.error(error);

      setConnectionStatus(
        "offline"
      );

      notify(
        "Could not join the room. Check the room code."
      );
    });
  }

  /*
  ==========================================================
  SELECT NEXT NUMBER
  ==========================================================
  */

  function selectNumber(number) {
    if (!myTurn) {
      notify(
        `Wait for ${
          currentPlayer?.name ||
          "the current player"
        }.`
      );

      return;
    }

    if (
      game.called.includes(number)
    ) {
      return;
    }

    const message = {
      type: "CALL_NUMBER",

      number,

      playerId:
        playerId.current,
    };

    /*
    Coordinator processes its own
    selection directly.
    */

    if (
      isCoordinatorRef.current
    ) {
      handleMessage(message);
    } else {
      /*
      Normal players send the request
      to the coordinator.
      */

      sendToEveryone(message);
    }
  }

  /*
  ==========================================================
  RANDOMIZE CARD
  ==========================================================
  */

  function randomizeCard() {
    const newBoard =
      shuffle(
        numbersFor(count)
      );

    setBoard(newBoard);
  }

  /*
  ==========================================================
  MANUAL CARD
  ==========================================================
  */

  function toggleManualNumber(number) {
    setBoard(previous => {
      if (
        previous.includes(number)
      ) {
        return previous.filter(
          n => n !== number
        );
      }

      if (
        previous.length >= count
      ) {
        return previous;
      }

      return [
        ...previous,
        number,
      ];
    });
  }

  /*
  ==========================================================
  LEAVE
  ==========================================================
  */

  function leaveGame() {
    destroyPeer();

    isCoordinatorRef.current =
      false;

    connectingRef.current =
      false;

    setConnectionStatus(
      "offline"
    );

    setScreen("home");

    setRoom("");

    setWinner(false);

    setGame(
      makeInitialGame(
        25,
        {
          id: playerId.current,
          name: "",
        }
      )
    );

    setBoard([]);

    setCalled([]);
  }

  /*
  ==========================================================
  HOME
  ==========================================================
  */

  if (screen === "home") {
    return (
      <div className="app">
        <main className="home">

          <div className="brand">

            <div className="brandIcon">
              B
            </div>

            <div>
              <h1>
                LAN Bingo
              </h1>

              <p>
                Multiplayer Bingo
              </p>
            </div>

          </div>

          <section className="card setupCard">

            <label>
              Your name
            </label>

            <input
              value={name}
              onChange={event =>
                setName(
                  event.target.value
                )
              }
              placeholder="Enter your name"
              maxLength={20}
            />

            <div className="divider">
              NUMBER POOL
            </div>

            <div className="choiceGrid">

              {[25, 100].map(number => (

                <button
                  key={number}
                  className={
                    count === number
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => {
                    setCount(number);
                    setBoard([]);
                  }}
                >

                  <b>
                    {number}
                  </b>

                  <span>
                    numbers
                  </span>

                </button>

              ))}

            </div>

            <div className="divider">
              YOUR CARD
            </div>

            <div className="tabs">

              <button
                className={
                  mode === "random"
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setMode("random");

                  /*
                  Generate the card immediately.

                  This is the ONLY place the random
                  card gets randomized when switching
                  to random mode.
                  */

                  setBoard(
                    shuffle(
                      numbersFor(count)
                    )
                  );
                }}
              >
                🎲 Random
              </button>

              <button
                className={
                  mode === "manual"
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setMode("manual");
                  setBoard([]);
                }}
              >
                ✋ Choose myself
              </button>

            </div>

            {mode === "random" && (

              <>

                <div className="preview">

                  {board
                    .slice(
                      0,
                      Math.min(
                        15,
                        board.length
                      )
                    )
                    .map(number => (

                      <span
                        key={number}
                      >
                        {number}
                      </span>

                    ))}

                </div>

                <button
                  className="secondary"
                  onClick={
                    randomizeCard
                  }
                >
                  🔀 Randomize Card
                </button>

              </>

            )}

            {mode === "manual" && (

              <>

                <p className="hint">

                  Select exactly{" "}

                  <b>
                    {count}
                  </b>

                  {" "}numbers.

                  <br />

                  Selected:{" "}

                  <b>
                    {board.length}/{count}
                  </b>

                </p>

                <div className="picker">

                  {numbersFor(
                    count
                  ).map(number => (

                    <button
                      key={number}
                      className={
                        board.includes(
                          number
                        )
                          ? "picked"
                          : ""
                      }
                      onClick={() =>
                        toggleManualNumber(
                          number
                        )
                      }
                    >
                      {number}
                    </button>

                  ))}

                </div>

              </>

            )}

            <button
              className="primary"
              onClick={createGame}
            >
              Create Game
            </button>

            <div className="divider">
              OR JOIN
            </div>

            <input
              value={room}
              onChange={event =>
                setRoom(
                  event.target.value.toUpperCase()
                )
              }
              placeholder="Room code"
              maxLength={8}
            />

            <button
              className="secondary"
              onClick={joinGame}
            >
              Join Game
            </button>

          </section>

          <p className="network">
            ● Multiplayer Bingo
          </p>

        </main>

        {notice && (
          <div className="toast">
            {notice}
          </div>
        )}

      </div>
    );
  }

  /*
  ==========================================================
  GAME SCREEN
  ==========================================================
  */

  return (
    <div className="app">

      <header className="topbar">

        <div>

          <h2>
            LAN Bingo
          </h2>

          <small>
            Room:{" "}
            <b>
              {room}
            </b>
          </small>

        </div>

        <div className="topActions">

          <span
            className={`status ${connectionStatus}`}
          >
            ●{" "}
            {connectionStatus ===
            "connected"
              ? "Connected"
              : "Connecting"}
          </span>

          <button
            className="small"
            onClick={leaveGame}
          >
            Leave
          </button>

        </div>

      </header>

      <main className="gameLayout">

        {/* TURN */}

        <section className="turnCard">

          <div>

            <small>
              CURRENT TURN
            </small>

            <h2>

              {myTurn
                ? "Your turn"
                : `${currentPlayer?.name || "Waiting"}'s turn`}

            </h2>

            <p>

              {myTurn
                ? "Choose the next number."
                : "Wait for the current player."}

            </p>

          </div>

          <div className="playerList">

            {game.players.map(
              (player, index) => (

                <div
                  key={player.id}
                  className={
                    index === game.turnIndex
                      ? "player active"
                      : "player"
                  }
                >

                  <span>
                    {index + 1}
                  </span>

                  <b>

                    {player.name}

                    {player.id ===
                    playerId.current
                      ? " (You)"
                      : ""}

                  </b>

                </div>

              )
            )}

          </div>

        </section>

        {/* SHARED NUMBER BOARD */}

        <section className="calledPanel">

          <div className="sectionTitle">

            <div>

              <h2>
                Select Next Number
              </h2>

              <p>

                {myTurn
                  ? "Tap any available number."
                  : `Waiting for ${
                      currentPlayer?.name ||
                      "player"
                    }.`}

              </p>

            </div>

            <strong className="counter">

              {game.called.length}
              /
              {count}

            </strong>

          </div>

          <div
            className="numberGrid"
            style={{
              gridTemplateColumns:
                `repeat(${boardSize}, minmax(0, 1fr))`,
            }}
          >

            {numbersFor(count).map(
              number => {

                const used =
                  game.called.includes(
                    number
                  );

                return (

                  <button
                    key={number}
                    disabled={
                      used ||
                      !myTurn
                    }
                    className={
                      `number ${
                        used
                          ? "used"
                          : ""
                      }`
                    }
                    onClick={() =>
                      selectNumber(
                        number
                      )
                    }
                  >

                    {number}

                  </button>

                );
              }
            )}

          </div>

        </section>

        {/* BINGO CARD */}

        <section className="card bingoCard">

          <div className="bingoHeader">

            {LETTERS.map(
              (letter, index) => (

                <span
                  key={letter}
                  className={
                    index <
                    Math.min(
                      completedLines.length,
                      5
                    )
                      ? "crossed"
                      : ""
                  }
                >

                  {letter}

                </span>

              )
            )}

          </div>

          <div className="cardTitle">

            <div>

              <h2>
                Your Bingo Card
              </h2>

              <p>

                {completedLines.length}

                {" "}completed line

                {completedLines.length ===
                1
                  ? ""
                  : "s"}

              </p>

            </div>

            {completedLines.length >
              0 && (

              <strong className="bingoWin">

                {completedLines.length >=
                5
                  ? "BINGO!"
                  : `${completedLines.length}/5`}

              </strong>

            )}

          </div>

          <div
            className="playerBoard"
            style={{
              gridTemplateColumns:
                `repeat(${boardSize}, minmax(0, 1fr))`,
            }}
          >

            {board.map(
              (number, index) => {

                const called =
                  calledSet.has(
                    number
                  );

                const line =
                  completedCells.has(
                    index
                  );

                return (

                  <div
                    key={`${number}-${index}`}
                    className={[
                      "cell",

                      called
                        ? "hit"
                        : "",

                      line
                        ? "line"
                        : "",

                    ].join(" ")}
                  >

                    {number}

                    {called && (
                      <span>
                        ✓
                      </span>
                    )}

                  </div>

                );
              }
            )}

          </div>

          {completedLines.length >
            0 && (

            <div className="lineMessage">

              {completedLines.length >=
              5
                ? "🎉 BINGO! Five lines completed."
                : `✓ Line ${completedLines.length} completed`}

            </div>

          )}

        </section>

        {/* CALLED HISTORY */}

        <section className="card history">

          <div className="sectionTitle">

            <div>

              <h3>
                Called Numbers
              </h3>

              <p>
                Same sequence for every player.
              </p>

            </div>

          </div>

          <div className="calledList">

            {game.called.length > 0
              ? game.called.map(
                  (number, index) => (

                    <span
                      key={number}
                    >

                      <small>
                        {index + 1}
                      </small>

                      {number}

                    </span>

                  )
                )
              : (

                <p className="empty">
                  No numbers selected yet.
                </p>

              )}

          </div>

        </section>

      </main>

      {winner && (

        <div className="winnerOverlay">

          <div className="winnerCard">

            <div className="winnerBingo">
              BINGO!
            </div>

            <h2>
              {name}
            </h2>

            <p>
              You completed five lines.
            </p>

            <button
              className="primary"
              onClick={() =>
                setWinner(false)
              }
            >
              Continue
            </button>

          </div>

        </div>

      )}

      {notice && (

        <div className="toast">
          {notice}
        </div>

      )}

    </div>
  );
}

/*
============================================================
COMPATIBILITY HELPERS
============================================================
*/

function setCalled(values) {
  // Intentionally unused.
  // Kept out of the game flow so called numbers are always
  // controlled by the multiplayer game state.
}