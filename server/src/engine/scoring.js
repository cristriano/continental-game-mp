export function cardPoints(card) {
  if (!card) return 0;
  if (card.isJoker) return 50;
  if (card.value === "A") return 20;
  if (["K","Q","J"].includes(card.value)) return 10;
  return parseInt(card.value, 10) || 0;
}
