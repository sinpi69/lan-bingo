export default function Scoreboard({ players, playerId }) {
  const ranked = [...players].sort((a, b) => {
    if (a.placement !== null && b.placement !== null) {
      return a.placement - b.placement;
    }

    if (a.placement !== null) return -1;
    if (b.placement !== null) return 1;

    return b.score - a.score;
  });

  return (
    <section className="card scoreboard">
      <div className="sectionTitle">
        <div>
          <h2>Scoreboard</h2>
          <p>Scores update after every placement.</p>
        </div>
      </div>

      <div className="scoreRows">
        {ranked.map((player) => (
          <div
            className={
              player.id === playerId
                ? "scoreRow youScore"
                : "scoreRow"
            }
            key={player.id}
          >
            <div className="rank">
              {player.placement || "—"}
            </div>

            <div className="scorePlayer">
              <b>
                {player.name}
                {player.id === playerId ? " (You)" : ""}
              </b>

              <span>
                {player.eliminated
                  ? `Finished #${player.placement}`
                  : "Still playing"}
              </span>
            </div>

            <strong>{player.score}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}