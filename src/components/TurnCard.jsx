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
            : "Wait for the current player."}
        </p>
      </div>

      <div className="playerList">
        {players.map((player, index) => (
          <div
            key={player.id}
            className={index === turnIndex ? "player active" : "player"}
          >
            <span>{index + 1}</span>

            <b>
              {player.name}
              {player.id === playerId ? " (You)" : ""}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}