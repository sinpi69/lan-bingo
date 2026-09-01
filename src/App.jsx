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

function makeGame(count, player) {
  return {
    version: 1,

    // waiting = waiting room
    // playing = actual bingo game
    phase: "waiting",

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
    makeGame(25, {
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
    game.phase === "playing" &&
    myIndex !== -1 &&
    myIndex === game.turnIndex;

  const boardSize =
    count === 25 ? 5 : 10;

  /*
  ------------------------------------------------------------
  NOTICE
  ------------------------------------------------------------
  */

  useEffect(() => {
    if (!notice) return;

    const timeout = setTimeout(() => {
      setNotice("");
    }, 2500);

    return () => clearTimeout(timeout);
  }, [notice]);

  /*
  ------------------------------------------------------------
  BINGO DETECTION
  ------------------------------------------------------------
  */

  useEffect(() => {
    if (
      game.phase === "playing" &&
      completedLines.length >= 5
    ) {
      setWinner(true);
    }
  }, [
    completedLines.length,
    game.phase,
  ]);

  /*
  ------------------------------------------------------------
  CLEANUP
  ------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(
        connection => {
          try {
            connection.close();
          } catch {}
        }
      );

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

  /*
  ------------------------------------------------------------
  SEND TO ALL CONNECTED PLAYERS
  ------------------------------------------------------------
  */

  function sendToEveryone(message) {
    const data = JSON.stringify(message);

    connectionsRef.current.forEach(
      connection => {
        if (connection.open) {
          try {
            connection.send(data);
          } catch {}
        }
      }
    );
  }

  /*
  ------------------------------------------------------------
  BROADCAST GAME STATE
  ------------------------------------------------------------
  */

  function broadcastGame(nextGame) {
    const currentVersion =
      Number(
        gameRef.current.version || 0
      );

    const finalGame = {
      ...nextGame,

      version:
        Math.max(
          Number(
            nextGame.version || 0
          ),
          currentVersion + 1
        ),
    };

    updateGame(finalGame);

    sendToEveryone({
      type: "GAME_STATE",
      game: finalGame,
    });
  }

  /*
  ------------------------------------------------------------
  ADD PLAYER
  ------------------------------------------------------------
  */

  function addPlayer(player) {
    const current =
      gameRef.current;

    if (
      current.players.some(
        existing =>
          existing.id === player.id
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

  /*
  ------------------------------------------------------------
  MESSAGE HANDLER
  ------------------------------------------------------------
  */

  function handleMessage(
    message,
    connection
  ) {
    if (!message) return;

    /*
    PLAYER JOINED
    */

    if (message.type === "JOIN") {
      if (
        !isCoordinatorRef.current
      ) {
        return;
      }

      const nextGame =
        addPlayer(
          message.player
        );

      /*
      Send the new player the
      latest state immediately.
      */

      if (connection?.open) {
        connection.send(
          JSON.stringify({
            type: "GAME_STATE",
            game: nextGame,
          })
        );
      }

      /*
      Update everyone else.
      */

      broadcastGame(
        nextGame
      );

      return;
    }

    /*
    REQUEST GAME STATE
    */

    if (
      message.type ===
      "REQUEST_GAME"
    ) {
      if (
        !isCoordinatorRef.current
      ) {
        return;
      }

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
    GAME STATE
    */

    if (
      message.type ===
      "GAME_STATE"
    ) {
      const incoming =
        message.game;

      if (!incoming) return;

      const currentVersion =
        Number(
          gameRef.current.version ||
            0
        );

      const incomingVersion =
        Number(
          incoming.version ||
            0
        );

      if (
        incomingVersion >=
        currentVersion
      ) {
        updateGame(
          incoming
        );

        setCount(
          incoming.count
        );

        setConnectionStatus(
          "connected"
        );

        /*
        This is the important part:

        Waiting room automatically changes
        to game screen when phase becomes
        "playing".
        */

        if (
          incoming.phase ===
          "playing"
        ) {
          setScreen("game");
        } else {
          setScreen("waiting");
        }
      }

      return;
    }

    /*
    START GAME
    */

    if (
      message.type ===
      "START_GAME"
    ) {
      if (
        !isCoordinatorRef.current
      ) {
        return;
      }

      const current =
        gameRef.current;

      /*
      At least one other player
      must be present.
      */

      if (
        current.players.length <
        2
      ) {
        notify(
          "Wait for at least one more player."
        );

        return;
      }

      const nextGame = {
        ...current,

        phase: "playing",

        called: [],

        turnIndex: 0,
      };

      broadcastGame(
        nextGame
      );

      /*
      Coordinator also switches
      immediately.
      */

      setScreen("game");

      return;
    }

    /*
    CALL NUMBER
    */

    if (
      message.type ===
      "CALL_NUMBER"
    ) {
      if (
        !isCoordinatorRef.current
      ) {
        return;
      }

      const current =
        gameRef.current;

      if (
        current.phase !==
        "playing"
      ) {
        return;
      }

      const number =
        Number(
          message.number
        );

      /*
      Validate number.
      */

      if (
        number < 1 ||
        number > current.count
      ) {
        return;
      }

      /*
      Can't select an already
      called number.
      */

      if (
        current.called.includes(
          number
        )
      ) {
        return;
      }

      const player =
        current.players[
          current.turnIndex
        ];

      if (!player) return;

      /*
      Make sure the request
      came from the player whose
      turn it actually is.
      */

      if (
        player.id !==
        message.playerId
      ) {
        return;
      }

      const nextTurn =
        current.players.length
          ? (
              current.turnIndex +
              1
            ) %
            current.players.length
          : 0;

      const nextGame = {
        ...current,

        called: [
          ...current.called,
          number,
        ],

        turnIndex:
          nextTurn,
      };

      broadcastGame(
        nextGame
      );

      return;
    }
  }

  /*
  ------------------------------------------------------------
  CONNECTION SETUP
  ------------------------------------------------------------
  */

  function setupConnection(
    connection
  ) {
    connectionsRef.current.set(
      connection.peer,
      connection
    );

    connection.on(
      "open",
      () => {
        setConnectionStatus(
          "connected"
        );

        /*
        Tell coordinator who
        we are.
        */

        connection.send(
          JSON.stringify({
            type: "JOIN",

            player: {
              id:
                playerId.current,

              name:
                nameRef.current.trim(),
            },
          })
        );

        /*
        Request current room state.
        */

        connection.send(
          JSON.stringify({
            type: "REQUEST_GAME",
          })
        );
      }
    );

    connection.on(
      "data",
      data => {
        try {
          const message =
            typeof data ===
            "string"
              ? JSON.parse(data)
              : data;

          handleMessage(
            message,
            connection
          );
        } catch {
          // Ignore malformed data.
        }
      }
    );

    connection.on(
      "close",
      () => {
        connectionsRef.current.delete(
          connection.peer
        );
      }
    );

    connection.on(
      "error",
      () => {
        connectionsRef.current.delete(
          connection.peer
        );
      }
    );
  }

  /*
  ------------------------------------------------------------
  DESTROY PEER
  ------------------------------------------------------------
  */

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
  ============================================================
  CREATE GAME
  ============================================================
  */

  function createGame() {
    if (!name.trim()) {
      notify(
        "Enter your name first."
      );

      return;
    }

    /*
    Manual card must be complete.
    */

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(
        `Select exactly ${count} numbers.`
      );

      return;
    }

    /*
    Random card gets generated ONCE.

    If already randomized,
    do NOT shuffle again.
    */

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(
              numbersFor(count)
            )
        : board;

    setBoard(
      finalBoard
    );

    const newRoom =
      createRoomCode();

    setRoom(
      newRoom
    );

    roomRef.current =
      newRoom;

    nameRef.current =
      name.trim();

    destroyPeer();

    setConnectionStatus(
      "connecting"
    );

    /*
    Create the room coordinator.

    This does NOT make this player
    the game master.

    It only keeps the shared room state.
    */

    const coordinatorId =
      `bingo-${newRoom}-coordinator`;

    const peer =
      new Peer(
        coordinatorId
      );

    peerRef.current =
      peer;

    peer.on(
      "open",
      () => {
        isCoordinatorRef.current =
          true;

        const me = {
          id:
            playerId.current,

          name:
            name.trim(),
        };

        const newGame =
          makeGame(
            count,
            me
          );

        updateGame(
          newGame
        );

        setConnectionStatus(
          "connected"
        );

        /*
        IMPORTANT:

        Go to WAITING ROOM,
        NOT the game.
        */

        setScreen(
          "waiting"
        );
      }
    );

    peer.on(
      "connection",
      connection => {
        setupConnection(
          connection
        );
      }
    );

    peer.on(
      "error",
      error => {
        console.error(
          error
        );

        setConnectionStatus(
          "offline"
        );

        notify(
          "Could not create the room."
        );
      }
    );
  }

  /*
  ============================================================
  JOIN GAME
  ============================================================
  */

  function joinGame() {
    if (!name.trim()) {
      notify(
        "Enter your name first."
      );

      return;
    }

    if (!room.trim()) {
      notify(
        "Enter the room code."
      );

      return;
    }

    if (
      mode === "manual" &&
      board.length !== count
    ) {
      notify(
        `Select exactly ${count} numbers.`
      );

      return;
    }

    /*
    Give this player their own card.

    Every player gets a different random
    arrangement.
    */

    const finalBoard =
      mode === "random"
        ? board.length === count
          ? board
          : shuffle(
              numbersFor(count)
            )
        : board;

    setBoard(
      finalBoard
    );

    const roomCode =
      room.trim().toUpperCase();

    setRoom(
      roomCode
    );

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
      new Peer(
        myPeerId
      );

    peerRef.current =
      peer;

    peer.on(
      "open",
      () => {
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

        /*
        We initially show the waiting
        screen while waiting for the
        room state.
        */

        setScreen(
          "waiting"
        );
      }
    );

    peer.on(
      "error",
      error => {
        console.error(
          error
        );

        setConnectionStatus(
          "offline"
        );

        notify(
          "Could not join the room. Check the room code."
        );
      }
    );
  }

  /*
  ============================================================
  START BINGO
  ============================================================
  */

  function startBingo() {
    /*
    Only the room creator can press
    this button.

    They are NOT the host during
    the actual game.
    */

    if (
      !isCoordinatorRef.current
    ) {
      return;
    }

    if (
      game.players.length <
      2
    ) {
      notify(
        "You need at least 2 players."
      );

      return;
    }

    handleMessage({
      type:
        "START_GAME",
    });
  }

  /*
  ============================================================
  SELECT NUMBER
  ============================================================
  */

  function selectNumber(
    number
  ) {
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
      game.called.includes(
        number
      )
    ) {
      return;
    }

    const message = {
      type:
        "CALL_NUMBER",

      number,

      playerId:
        playerId.current,
    };

    /*
    Room coordinator processes
    its own request directly.
    */

    if (
      isCoordinatorRef.current
    ) {
      handleMessage(
        message
      );
    } else {
      /*
      Non-coordinator player sends
      the request to coordinator.
      */

      connectionsRef.current.forEach(
        connection => {
          if (
            connection.open
          ) {
            try {
              connection.send(
                JSON.stringify(
                  message
                )
              );
            } catch {}
          }
        }
      );
    }
  }

  /*
  ============================================================
  RANDOMIZE CARD
  ============================================================
  */

  function randomizeCard() {
    setBoard(
      shuffle(
        numbersFor(count)
      )
    );
  }

  /*
  ============================================================
  MANUAL CARD
  ============================================================
  */

  function toggleManualNumber(
    number
  ) {
    setBoard(previous => {
      if (
        previous.includes(
          number
        )
      ) {
        return previous.filter(
          n => n !== number
        );
      }

      if (
        previous.length >=
        count
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
  ============================================================
  LEAVE
  ============================================================
  */

  function leaveGame() {
    destroyPeer();

    isCoordinatorRef.current =
      false;

    setConnectionStatus(
      "offline"
    );

    setRoom("");

    setBoard([]);

    setWinner(false);

    setGame(
      makeGame(
        25,
        {
          id:
            playerId.current,
          name: "",
        }
      )
    );

    setScreen(
      "home"
    );
  }

  /*
  ============================================================
  HOME
  ============================================================
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
              onChange={e =>
                setName(
                  e.target.value
                )
              }
              placeholder="Enter your name"
              maxLength={20}
            />

            <div className="divider">
              NUMBER POOL
            </div>

            <div className="choiceGrid">

              {[25, 100].map(
                number => (

                  <button
                    key={number}
                    className={
                      count === number
                        ? "choice active"
                        : "choice"
                    }
                    onClick={() => {
                      setCount(
                        number
                      );

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

                )
              )}

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
                  setMode(
                    "random"
                  );

                  setBoard(
                    shuffle(
                      numbersFor(
                        count
                      )
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
                  setMode(
                    "manual"
                  );

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
                    .map(
                      number => (
                        <span
                          key={number}
                        >
                          {number}
                        </span>
                      )
                    )}

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
                    {board.length}
                    /
                    {count}
                  </b>

                </p>

                <div className="picker">

                  {numbersFor(
                    count
                  ).map(
                    number => (

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

                    )
                  )}

                </div>

              </>
            )}

            <button
              className="primary"
              onClick={
                createGame
              }
            >
              Create Game
            </button>

            <div className="divider">
              OR JOIN
            </div>

            <input
              value={room}
              onChange={e =>
                setRoom(
                  e.target.value.toUpperCase()
                )
              }
              placeholder="Room code"
              maxLength={8}
            />

            <button
              className="secondary"
              onClick={
                joinGame
              }
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
  ============================================================
  WAITING ROOM
  ============================================================
  */

  if (
    screen === "waiting"
  ) {
    return (
      <div className="app">

        <header className="topbar">

          <div>

            <h2>
              LAN Bingo
            </h2>

            <small>
              Waiting Room
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
              onClick={
                leaveGame
              }
            >
              Leave
            </button>

          </div>

        </header>

        <main className="home">

          <section
            className="card"
            style={{
              textAlign: "center",
              marginTop: 20,
            }}
          >

            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#777e87",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              ROOM CODE
            </div>

            <div
              style={{
                fontSize: 42,
                fontWeight: 950,
                letterSpacing: 7,
                marginBottom: 8,
              }}
            >
              {room}
            </div>

            <p
              style={{
                color: "#777e87",
                fontSize: 12,
                marginBottom: 24,
              }}
            >
              Share this code with everyone
              who wants to play.
            </p>

            <div
              style={{
                height: 1,
                background: "#e5e7ea",
                margin: "20px 0",
              }}
            />

            <div
              style={{
                textAlign: "left",
              }}
            >

              <h2
                style={{
                  margin: "0 0 4px",
                  fontSize: 20,
                }}
              >
                Players
              </h2>

              <p
                style={{
                  margin: "0 0 14px",
                  color: "#858b94",
                  fontSize: 11,
                }}
              >
                {game.players.length}{" "}
                player
                {game.players.length ===
                1
                  ? ""
                  : "s"} connected
              </p>

            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                marginBottom: 22,
              }}
            >

              {game.players.map(
                (player, index) => (

                  <div
                    key={player.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 12px",
                      borderRadius: 9,
                      background:
                        player.id ===
                        playerId.current
                          ? "#eef0f2"
                          : "#f7f7f8",
                      border:
                        "1px solid #e1e4e8",
                      textAlign: "left",
                    }}
                  >

                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background:
                          "#111827",
                        color: "white",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 900,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>

                      <b
                        style={{
                          fontSize: 13,
                        }}
                      >
                        {player.name}
                      </b>

                      {player.id ===
                        playerId.current && (
                        <div
                          style={{
                            fontSize: 9,
                            color:
                              "#777e87",
                            marginTop: 2,
                          }}
                        >
                          You
                        </div>
                      )}

                    </div>

                  </div>

                )
              )}

            </div>

            {isCoordinatorRef.current ? (
              <>

                <button
                  className="primary"
                  onClick={
                    startBingo
                  }
                  disabled={
                    game.players.length <
                    2
                  }
                >
                  {game.players.length <
                  2
                    ? "Waiting for players..."
                    : "Start Bingo"}
                </button>

                <p
                  style={{
                    color: "#858b94",
                    fontSize: 10,
                    marginTop: 10,
                  }}
                >
                  You can start once
                  everyone has joined.
                </p>

              </>
            ) : (

              <div
                style={{
                  padding: 14,
                  borderRadius: 9,
                  background:
                    "#f0f1f3",
                  color: "#666c74",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Waiting for the
                game to start...
              </div>

            )}

          </section>

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
  ============================================================
  GAME SCREEN
  ============================================================
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
            ● Connected
          </span>

          <button
            className="small"
            onClick={
              leaveGame
            }
          >
            Leave
          </button>

        </div>

      </header>

      <main className="gameLayout">

        {/* CURRENT TURN */}

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
                    index ===
                    game.turnIndex
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

        {/* NUMBER SELECTION */}

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

            {numbersFor(
              count
            ).map(number => {

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

            })}

          </div>

        </section>

        {/* BINGO HEADER */}

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

          {/* PLAYER'S OWN CARD */}

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

        {/* HISTORY */}

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

            {game.called.length
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