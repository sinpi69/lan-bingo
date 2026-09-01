import { useState } from "react";

export default function WaitingRoom({
  room,
  game,
  playerId,
  connectionStatus,
  isCoordinator,
  onStart,
  onLeave,
}) {
  const [copied, setCopied] = useState(false);
  const players = game.players || [];
  const connectedCount = players.filter((player) => player.connected).length;
  const allConnected = players.length > 0 && connectedCount === players.length;

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function shareRoom() {
    const text = `Join my Bingo game! Room code: ${room}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "LAN Bingo", text });
        return;
      } catch {
        // User cancelled the share sheet.
      }
    }

    copyRoomCode();
  }

  const statusText = {
    connected: "Connected",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    offline: "Offline",
  }[connectionStatus] || "Connecting";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h2>LAN Bingo</h2>
          <small>Waiting Room</small>
        </div>

        <div className="topActions">
          <span className={`status ${connectionStatus}`}>
            <span className="statusDot">●</span> {statusText}
          </span>
          <button className="small" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <main className="home">
        <section className="card waitingCard">
          <div className="roomLabel">ROOM CODE</div>

          <div className="roomCodeRow">
            <div className="roomCode">{room}</div>
            <button className="roomAction" onClick={copyRoomCode}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="roomHelp">
            Send this code to everyone who wants to play.
          </p>

          <button className="shareRoomButton" onClick={shareRoom}>
            Share room
          </button>

          <div className="waitingDivider" />

          <div className="playersHeading">
            <div>
              <h2>Players</h2>
              <p>
                {connectedCount} of {players.length} connected
              </p>
            </div>
            <span className="playerCountBadge">{players.length}</span>
          </div>

          <div className="waitingPlayers">
            {players.map((player, index) => {
              const isYou = player.id === playerId;
              const connected = player.connected;

              return (
                <div
                  className={`waitingPlayer${isYou ? " you" : ""}`}
                  key={player.id}
                >
                  <div className="playerNumber">{index + 1}</div>

                  <div className="waitingPlayerInfo">
                    <b>{player.name}</b>
                    {isYou && <div className="youLabel">You</div>}
                  </div>

                  <span className={`playerConnection ${connected ? "online" : "offline"}`}>
                    <span>●</span> {connected ? "Connected" : "Reconnecting"}
                  </span>
                </div>
              );
            })}
          </div>

          {isCoordinator ? (
            <>
              <button
                className="primary"
                onClick={onStart}
                disabled={players.length < 2 || !allConnected || connectionStatus !== "connected"}
              >
                {players.length < 2
                  ? "Waiting for players..."
                  : !allConnected
                    ? "Waiting for connection..."
                    : "Start Bingo"}
              </button>

              <p className="waitingHint">
                Everyone must be connected before the game can start.
              </p>
            </>
          ) : (
            <div className="waitingMessage">
              {connectionStatus === "reconnecting"
                ? "Connection lost. Reconnecting..."
                : "Waiting for the host to start the game..."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
