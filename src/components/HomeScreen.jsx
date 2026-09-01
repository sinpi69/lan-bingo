import { numbersFor } from "../utils/bingo";

export default function HomeScreen({
  name,
  setName,
  room,
  setRoom,
  count,
  setCount,
  mode,
  setMode,
  board,
  setBoard,
  onRandomize,
  onToggleManual,
  onCreate,
  onJoin,
}) {
  return (
    <main className="home">
      <div className="brand">
        <div className="brandIcon">B</div>

        <div>
          <h1>LAN Bingo</h1>
          <p>Multiplayer Bingo</p>
        </div>
      </div>

      <section className="card setupCard">
        <label>Your name</label>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={20}
        />

        <div className="divider">NUMBER POOL</div>

        <div className="choiceGrid">
          {[25, 100].map((number) => (
            <button
              key={number}
              className={count === number ? "choice active" : "choice"}
              onClick={() => {
                setCount(number);
                setBoard([]);
              }}
            >
              <b>{number}</b>
              <span>numbers</span>
            </button>
          ))}
        </div>

        <div className="divider">YOUR CARD</div>

        <div className="tabs">
          <button
            className={mode === "random" ? "active" : ""}
            onClick={() => {
              setMode("random");
              setBoard([]);
            }}
          >
            🎲 Random
          </button>

          <button
            className={mode === "manual" ? "active" : ""}
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
              {board.slice(0, Math.min(15, board.length)).map((number) => (
                <span key={number}>{number}</span>
              ))}
            </div>

            <button className="secondary" onClick={onRandomize}>
              🔀 Randomize Card
            </button>
          </>
        )}

        {mode === "manual" && (
          <>
            <p className="hint">
              Select exactly <b>{count}</b> numbers.
              <br />
              Selected: <b>{board.length}/{count}</b>
            </p>

            <div className="picker">
              {numbersFor(count).map((number) => (
                <button
                  key={number}
                  className={board.includes(number) ? "picked" : ""}
                  onClick={() => onToggleManual(number)}
                >
                  {number}
                </button>
              ))}
            </div>
          </>
        )}

        <button className="primary" onClick={onCreate}>
          Create Game
        </button>

        <div className="divider">OR JOIN</div>

        <input
          value={room}
          onChange={(e) => setRoom(e.target.value.toUpperCase())}
          placeholder="Room code"
          maxLength={8}
        />

        <button className="secondary" onClick={onJoin}>
          Join Game
        </button>
      </section>

      <p className="network">● Multiplayer Bingo</p>
    </main>
  );
}