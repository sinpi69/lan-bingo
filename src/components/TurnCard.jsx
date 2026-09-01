export default function TurnCard({
  players,
  turnIndex,
  playerId,
  myTurn,
}) {
  const currentPlayer = players[turnIndex];

  return (
    <section className="turnCard">
      <div>
        <small>CURRENT TURN</small>

        <h2>
          {myTurn
            ? "Your turn"
            : `${currentPlayer?.name || "Waiting"}'s turn`}
        </h2>

        <p>
          {myTurn
            ? "Choose the next number."
            : currentPlayer?.active
              ? "Wait for the current player."
              : "The next active player will play."}
        </p>
      </div>

      <div className="playerList">
        {players.map((player, index) => (
          <div
            key={player.id}
            className={[
              "player",
              index === turnIndex && player.active ? "active" : "",
              !player.active ? "eliminated" : "",
            ].join(" ")}
          >
            <span>{player.placement || index + 1}</span>

            <b>
              {player.name}
              {player.id === playerId ? " (You)" : ""}
            </b>

            {!player.active && (
              <em>
                {player.placement
                  ? `#${player.placement}`
                  : "OUT"}
              </em>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}