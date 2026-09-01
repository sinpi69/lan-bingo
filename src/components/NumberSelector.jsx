import { numbersFor } from "../utils/bingo";

export default function NumberSelector({
  count,
  called,
  myTurn,
  currentPlayer,
  onSelect,
}) {
  const boardSize = count === 25 ? 5 : 10;

  return (
    <section className="calledPanel">
      <div className="sectionTitle">
        <div>
          <h2>Select Next Number</h2>

          <p>
            {myTurn
              ? "Tap any available number."
              : `Waiting for ${currentPlayer?.name || "player"}.`}
          </p>
        </div>

        <strong className="counter">
          {called.length}/{count}
        </strong>
      </div>

      <div
        className="numberGrid"
        style={{
          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
        }}
      >
        {numbersFor(count).map((number) => {
          const used = called.includes(number);

          return (
            <button
              key={number}
              disabled={used || !myTurn}
              className={`number ${used ? "used" : ""}`}
              onClick={() => onSelect(number)}
            >
              {number}
            </button>
          );
        })}
      </div>
    </section>
  );
}