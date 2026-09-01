import TurnCard from "./TurnCard";
import NumberSelector from "./NumberSelector";
import BingoCard from "./BingoCard";
import CalledNumbers from "./CalledNumbers";

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
  onSelectNumber,
  onLeave,
  winner,
  onCloseWinner,
}) {
  const currentPlayer = game.players[game.turnIndex];

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
        <TurnCard
          players={game.players}
          turnIndex={game.turnIndex}
          playerId={playerId}
          myTurn={myTurn}
        />

        <NumberSelector
          count={game.count}
          called={game.called}
          myTurn={myTurn}
          currentPlayer={currentPlayer}
          onSelect={onSelectNumber}
        />

        <BingoCard
          board={board}
          calledSet={calledSet}
          completedLines={completedLines}
          completedCells={completedCells}
        />

        <CalledNumbers called={game.called} />
      </main>

      {winner && (
        <WinnerOverlay
          name={name}
          onContinue={onCloseWinner}
        />
      )}
    </div>
  );
}