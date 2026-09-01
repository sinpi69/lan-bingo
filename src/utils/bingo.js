export const LETTERS = ["B", "I", "N", "G", "O"];

export function numbersFor(count) {
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export function getCompletedLines(board, called) {
  if (!board.length) return [];

  const size = Math.sqrt(board.length);
  if (!Number.isInteger(size)) return [];

  const lines = [];

  for (let row = 0; row < size; row++) {
    const line = Array.from(
      { length: size },
      (_, col) => row * size + col
    );

    if (line.every((index) => called.has(board[index]))) {
      lines.push(line);
    }
  }

  for (let col = 0; col < size; col++) {
    const line = Array.from(
      { length: size },
      (_, row) => row * size + col
    );

    if (line.every((index) => called.has(board[index]))) {
      lines.push(line);
    }
  }

  const diagonal1 = Array.from(
    { length: size },
    (_, i) => i * size + i
  );

  if (diagonal1.every((index) => called.has(board[index]))) {
    lines.push(diagonal1);
  }

  const diagonal2 = Array.from(
    { length: size },
    (_, i) => i * size + (size - 1 - i)
  );

  if (diagonal2.every((index) => called.has(board[index]))) {
    lines.push(diagonal2);
  }

  return lines;
}

export function createRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();
}

/*
  Players:
  - active: still participating and can take turns.
  - eliminated: completed 5 lines and finished their placement.

  placements use standard competition ranking:
  1, 1, 3 for a two-way tie.
*/
export function makeGame(count, player) {
  return {
    version: 1,
    phase: "waiting",
    count,
    called: [],
    players: [
      {
        ...player,
        active: true,
        eliminated: false,
        placement: null,
        score: 0,
      },
    ],
    turnIndex: 0,
    nextPlacement: 1,
  };
}

export function calculateScore(totalPlayers, placement) {
  return Math.max(0, (totalPlayers - placement) * 10);
}

export function getActivePlayers(players) {
  return players.filter((player) => player.active);
}

export function getPlayerById(players, playerId) {
  return players.find((player) => player.id === playerId);
}

export function getNextActiveTurnIndex(players, currentIndex) {
  if (!players.length) return -1;

  for (let offset = 1; offset <= players.length; offset++) {
    const index = (currentIndex + offset) % players.length;

    if (players[index]?.active) {
      return index;
    }
  }

  return -1;
}

export function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if (a.placement !== null && b.placement !== null) {
      return a.placement - b.placement;
    }

    if (a.placement !== null) return -1;
    if (b.placement !== null) return 1;

    return b.score - a.score;
  });
}