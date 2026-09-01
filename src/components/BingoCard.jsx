import { LETTERS } from "../utils/bingo";

export default function BingoCard({
  board,
  calledSet,
  completedLines,
  completedCells,
  eliminated,
}) {
  const boardSize = Math.sqrt(board.length);

  return (
    <div className="bingoBody">
      <div className="bingoHeader">
        {LETTERS.map((letter, index) => (
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
              : `${completedLines.length} completed line${
                  completedLines.length === 1 ? "" : "s"
                }`}
          </p>
        </div>

        {completedLines.length > 0 && (
          <strong className="bingoWin">
            {completedLines.length >= 5
              ? "BINGO!"
              : `${completedLines.length}/5`}
          </strong>
        )}
      </div>

      <div
        className={`playerBoard ${eliminated ? "eliminatedBoard" : ""}`}
        style={{
          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
        }}
      >
        {board.map((number, index) => {
          const called = calledSet.has(number);
          const line = completedCells.has(index);

          return (
            <div
              key={`${number}-${index}`}
              className={[
                "cell",
                called ? "hit" : "",
                line ? "line" : "",
              ].join(" ")}
            >
              {number}
              {called && <span>✓</span>}
            </div>
          );
        })}
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