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

export function makeGame(count, player) {
  return {
    version: 1,
    phase: "waiting",
    count,
    called: [],
    players: [player],
    turnIndex: 0,
  };
}