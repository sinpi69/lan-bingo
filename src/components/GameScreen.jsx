import BingoCard from "./BingoCard";
import NumberSelector from "./NumberSelector";
import WinnerOverlay from "./WinnerOverlay";

export default function GameScreen({
  room,
  game,
  playerId,
  name,
  connectionStatus,
  board,
  calledSet,
  completedLines,
  completedCells,
  myTurn,
  eliminated,
  onSelectNumber,
  onLeave,
  winner,
  onCloseWinner,
}) {
  const me = game.players.find((player) => player.id === playerId);

  return (
    <div className="app">
      <header className="topbar sticky">
        <div className="topbarInfo">
          <div className="topbarTitle">
            <h2>LAN Bingo</h2>
            <small>
              Room: <b>{room}</b>
            </small>
          </div>

          {myTurn && !eliminated ? (
            <div className="turnHighlight">YOUR TURN</div>
          ) : eliminated ? (
            <div className="turnHighlight finished">
              FINISHED #{me?.placement}
            </div>
          ) : (
            <div className="turnWaiting">
              {game.players[game.turnIndex]?.name || "Waiting"}'s turn
            </div>
          )}
        </div>

        <div className="topActions">
          <div className="topScore">
            <span>Score</span>
            <strong>{me?.score ?? 0}</strong>
          </div>

          <span className={`status ${connectionStatus}`}>
            ● {connectionStatus === "connected" ? "Connected" : "Connecting"}
          </span>

          <button className="small" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <main className="gameLayout">
        <section className="card playerStrip">
          <div className="playersTitle">
            <strong>Players</strong>
            <span>
              {game.players.filter((player) => player.active).length} active
            </span>
          </div>

          <div className="playerScoreList">
            {game.players.map((player) => (
              <div
                key={player.id}
                className={[
                  "playerScoreItem",
                  player.id === playerId ? "currentUser" : "",
                  player.id === game.players[game.turnIndex]?.id &&
                  player.active
                    ? "currentTurn"
                    : "",
                  !player.active ? "playerFinished" : "",
                ].join(" ")}
              >
                <div className="playerDot">
                  {player.placement || "•"}
                </div>

                <div className="playerScoreName">
                  <b>
                    {player.name}
                    {player.id === playerId ? " (You)" : ""}
                  </b>

                  <span>
                    {player.active
                      ? player.id === game.players[game.turnIndex]?.id
                        ? "Playing now"
                        : "Active"
                      : `Finished #${player.placement}`}
                  </span>
                </div>

                <strong className="playerScoreValue">
                  {player.score}
                </strong>
              </div>
            ))}
          </div>
        </section>

        {eliminated && (
          <div className="eliminatedBanner">
            <div>
              <strong>You are out of the game.</strong>
              <span>
                You finished #{me?.placement} and earned {me?.score} points.
              </span>
            </div>
            <b>{me?.score} pts</b>
          </div>
        )}

        <section className="card mainGameCard">
          <BingoCard
            board={board}
            calledSet={calledSet}
            completedLines={completedLines}
            completedCells={completedCells}
            eliminated={eliminated}
          />

          <div className="gameCardDivider" />

          <NumberSelector
            count={game.count}
            called={game.called}
            myTurn={myTurn}
            currentPlayer={game.players[game.turnIndex]}
            onSelect={onSelectNumber}
            eliminated={eliminated}
          />
        </section>

        <section className="card history">
          <div className="sectionTitle">
            <div>
              <h3>Called Numbers</h3>
              <p>Same sequence for every player.</p>
            </div>
            <strong className="counter">
              {game.called.length}/{game.count}
            </strong>
          </div>

          <div className="calledList">
            {game.called.length ? (
              game.called.map((number, index) => (
                <span key={number}>
                  <small>{index + 1}</small>
                  {number}
                </span>
              ))
            ) : (
              <p className="empty">No numbers selected yet.</p>
            )}
          </div>
        </section>
      </main>

      {winner && me && (
        <WinnerOverlay
          name={name}
          placement={me.placement}
          score={me.score}
          onContinue={onCloseWinner}
        />
      )}
    </div>
  );
}