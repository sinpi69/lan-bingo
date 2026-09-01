export default function WaitingRoom({
  room,
  game,
  playerId,
  connectionStatus,
  isCoordinator,
  onStart,
  onLeave,
}) {
  const playerCount = game.players.length;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h2>LAN Bingo</h2>
          <small>Waiting Room</small>
        </div>

        <div className="topActions">
          <span className={`status ${connectionStatus}`}>
            ● {connectionStatus === "connected" ? "Connected" : "Connecting"}
          </span>

          <button className="small" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <main className="home">
        <section className="card waitingCard">
          <div className="roomLabel">ROOM CODE</div>

          <div className="roomCode">{room}</div>

          <p className="roomHelp">
            Share this code with everyone who wants to play.
          </p>

          <div className="waitingDivider" />

          <div className="playersHeading">
            <h2>Players</h2>
            <p>
              {playerCount} player{playerCount === 1 ? "" : "s"} connected
            </p>
          </div>

          <div className="waitingPlayers">
            {game.players.map((player, index) => (
              <div
                className={
                  player.id === playerId
                    ? "waitingPlayer you"
                    : "waitingPlayer"
                }
                key={player.id}
              >
                <div className="playerNumber">{index + 1}</div>

                <div>
                  <b>{player.name}</b>

                  {player.id === playerId && (
                    <div className="youLabel">You</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isCoordinator ? (
            <>
              <button
                className="primary"
                onClick={onStart}
                disabled={playerCount < 2}
              >
                {playerCount < 2 ? "Waiting for players..." : "Start Bingo"}
              </button>

              <p className="waitingHint">
                You can start once everyone has joined.
              </p>
            </>
          ) : (
            <div className="waitingMessage">
              Waiting for the game to start...
            </div>
          )}
        </section>
      </main>
    </div>
  );
}