export default function WinnerOverlay({
  name,
  placement,
  score,
  onContinue,
}) {
  return (
    <div className="winnerOverlay">
      <div className="winnerCard">
        <div className="winnerBingo">BINGO!</div>

        <h2>{name}</h2>

        <p>
          You finished <b>#{placement}</b> with{" "}
          <b>{score} points</b>.
        </p>

        <button className="primary" onClick={onContinue}>
          View Game
        </button>
      </div>
    </div>
  );
}