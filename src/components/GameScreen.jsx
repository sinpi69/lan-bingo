import TurnCard from "./TurnCard";
import NumberSelector from "./NumberSelector";
import BingoCard from "./BingoCard";
import CalledNumbers from "./CalledNumbers";
import Scoreboard from "./Scoreboard";
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
  const currentPlayer = game.players[game.turnIndex];
  const me = game.players.find((player) => player.id === playerId);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h2>LAN Bingo</h2>
          <small>
            Room: <b>{room}</b>
          </small>
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

      <main className="gameLayout">
        {eliminated && (
          <div className="eliminatedBanner">
            <div>
              <strong>You are out of the game.</strong>
              <span>
                You finished #{me?.placement} and earned {me?.score} points.
              </span>
            </div>

            <b>Score: {me?.score}</b>
          </div>
        )}

        <TurnCard
          players={game.players}
          turnIndex={game.turnIndex}
          playerId={playerId}
          myTurn={myTurn}
        />

        <Scoreboard
          players={game.players}
          playerId={playerId}
        />

        <NumberSelector
          count={game.count}
          called={game.called}
          myTurn={myTurn}
          currentPlayer={currentPlayer}
          onSelect={onSelectNumber}
          eliminated={eliminated}
        />

        <BingoCard
          board={board}
          calledSet={calledSet}
          completedLines={completedLines}
          completedCells={completedCells}
          eliminated={eliminated}
        />

        <CalledNumbers called={game.called} />
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