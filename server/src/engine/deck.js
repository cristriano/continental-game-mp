import { SUITS, VALUES } from "./constants.js";

export function buildDeck() {
  const deck = [];
  for (let d = 0; d < 3; d++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ id: `${value}${suit}-${d}`, value, suit, isJoker: false });
      }
    }
  }
  deck.push({ id: "JOKER-0", value: "JKR", suit: "★", isJoker: true });
  deck.push({ id: "JOKER-1", value: "JKR", suit: "★", isJoker: true });
  return deck;
}

export function shuffle(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
