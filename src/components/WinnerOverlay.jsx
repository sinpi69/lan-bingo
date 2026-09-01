export default function WinnerOverlay({ name, onContinue }) {
  return (
    <div className="winnerOverlay">
      <div className="winnerCard">
        <div className="winnerBingo">BINGO!</div>

        <h2>{name}</h2>

        <p>You completed five lines.</p>

        <button className="primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}