export default function BingoCard({
  board,
  calledSet,
  completedLines,
  completedCells,
  eliminated,
  myTurn,
  onSelectNumber,
}) {
  const boardSize = Math.sqrt(board.length);

  return (
    <div className="bingoBody">
      <div className="bingoHeader">
        {["B", "I", "N", "G", "O"].map((letter, index) => (
          <span
            key={letter}
            className={
              index < Math.min(completedLines.length, 5)
                ? "crossed"
                : ""
            }
          >
            {letter}
          </span>
        ))}
      </div>

      <div className="cardTitle">
        <div>
          <h2>Your Bingo Card</h2>
          <p>
            {eliminated
              ? "Finished — no more turns"
              : myTurn
                ? "Your turn — select a number from your card"
                : "Wait for your turn"}
          </p>
        </div>

        <strong className="bingoWin">
          {completedLines.length >= 5
            ? "BINGO!"
            : `${completedLines.length}/5`}
        </strong>
      </div>

      <div
        className={`playerBoard ${
          eliminated ? "eliminatedBoard" : ""
        } ${myTurn ? "selectableBoard" : ""}`}
        style={{
          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
        }}
      >
        {board.map((number, index) => {
          const called = calledSet.has(number);
          const line = completedCells.has(index);
          const selectable = myTurn && !eliminated && !called;

          return (
            <button
              type="button"
              key={`${number}-${index}`}
              disabled={!selectable}
              onClick={() => onSelectNumber(number)}
              className={[
                "cell",
                called ? "hit" : "",
                line ? "line" : "",
                selectable ? "selectable" : "",
              ].join(" ")}
            >
              {number}
              {called && <span>✓</span>}
            </button>
          );
        })}
      </div>

      <div className="cardInstruction">
        {eliminated
          ? "Your placement is locked. Watch the remaining players."
          : myTurn
            ? "Click one of the available numbers above to call it."
            : "The active player will choose a number from their own card."}
      </div>

      {completedLines.length > 0 && (
        <div className="lineMessage">
          {completedLines.length >= 5
            ? "🎉 BINGO! Your placement has been recorded."
            : `✓ Line ${completedLines.length} completed`}
        </div>
      )}
    </div>
  );
}