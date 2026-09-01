const PLAYER_ID_KEY = "lan-bingo-player-id";

export function getPlayerId() {
  let id = sessionStorage.getItem(PLAYER_ID_KEY);

  if (!id) {
    id =
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-5);

    sessionStorage.setItem(PLAYER_ID_KEY, id);
  }

  return id;
}