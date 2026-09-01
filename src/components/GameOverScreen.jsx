import { sortLeaderboard } from "../utils/bingo";

export default function GameOverScreen({
  game,
  playerId,
  isCoordinator,
  onRestart,
  onLeave,
}) {
  const ranked = sortLeaderboard(game.players);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h2>LAN Bingo</h2>
          <small>Game Over</small>
        </div>

        <div className="topActions">
          <button className="small" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <main className="gameOverLayout">
        <section className="card gameOverCard">
          <div className="gameOverIcon">✓</div>
          <h1>Game Over</h1>
          <p className="gameOverSubtitle">
            Everyone has completed their placement.
          </p>

          <div className="finalStandings">
            {ranked.map((player) => (
              <div
                className={
                  player.id === playerId
                    ? "finalRow youScore"
                    : "finalRow"
                }
                key={player.id}
              >
                <div className="finalRank">
                  #{player.placement}
                </div>

                <div className="finalPlayer">
                  <b>
                    {player.name}
                    {player.id === playerId ? " (You)" : ""}
                  </b>
                  <span>
                    {player.placement === 1
                      ? "Winner"
                      : "Finished"}
                  </span>
                </div>

                <strong>{player.score} pts</strong>
              </div>
            ))}
          </div>

          {isCoordinator ? (
            <button className="primary" onClick={onRestart}>
              🔄 Restart with New Cards
            </button>
          ) : (
            <div className="waitingMessage">
              Waiting for the room creator to restart...
            </div>
          )}
        </section>
      </main>
    </div>
  );
}