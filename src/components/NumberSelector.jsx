import { numbersFor } from "../utils/bingo";

export default function NumberSelector({
  count,
  called,
  myTurn,
  currentPlayer,
  onSelect,
  eliminated,
}) {
  const boardSize = count === 25 ? 5 : 10;

  return (
    <div className="numberSelectorBody">
      <div className="sectionTitle">
        <div>
          <h2>Select Next Number</h2>

          <p>
            {eliminated
              ? "You finished your placement. You are out."
              : myTurn
                ? "Tap any available number."
                : `Waiting for ${currentPlayer?.name || "player"}.`}
          </p>
        </div>

        <strong className="counter">
          {called.length}/{count}
        </strong>
      </div>

      <div
        className={`numberGrid ${eliminated ? "disabledGrid" : ""}`}
        style={{
          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
        }}
      >
        {numbersFor(count).map((number) => {
          const used = called.includes(number);

          return (
            <button
              key={number}
              disabled={used || !myTurn || eliminated}
              className={`number ${used ? "used" : ""}`}
              onClick={() => onSelect(number)}
            >
              {number}
            </button>
          );
        })}
      </div>
    </div>
  );
}