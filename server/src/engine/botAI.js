import { VALUE_RANK, SUITS } from "./constants.js";
import { validateContract, canAddCardToMeld, normalizeMeldGroup, isValidSequence, orderSequenceCards, combinations } from "./validation.js";
import { cardPoints } from "./scoring.js";

export function evaluateCardUtility(card, hand, round) {
  if (!card) return -Infinity;
  if (card.isJoker) return 1000;
  let score = 0;
  const real = hand.filter(c => !c.isJoker);
  const sameValue = real.filter(c => c.value === card.value && c.id !== card.id).length;
  const sameSuit = real.filter(c => c.suit === card.suit);
  score += sameValue * (round.trios > 0 ? 12 : 7);
  for (const c of sameSuit) {
    if (c.id === card.id) continue;
    const diff = Math.abs(VALUE_RANK[c.value] - VALUE_RANK[card.value]);
    if (diff === 1) score += round.seqs > 0 ? 12 : 6;
    else if (diff === 2) score += round.seqs > 0 ? 6 : 3;
    else if (diff === 3 && round.seqs > 0) score += 2;
  }
  score -= Math.min(cardPoints(card), 20) * 0.25;
  return score;
}

export function chooseDrawSource(hand, discardTop, round) {
  if (!discardTop) return "deck";
  if (discardTop.isJoker) return "discard";
  const direct = evaluateCardUtility(discardTop, [...hand, discardTop], round);
  return direct >= 14 ? "discard" : "deck";
}

export function chooseBestDiscard(hand, round, avoidId = null) {
  let worst = null;
  let worstScore = Infinity;
  for (const card of hand) {
    if (avoidId && hand.length > 1 && card.id === avoidId) continue;
    const score = evaluateCardUtility(card, hand, round);
    if (score < worstScore) { worst = card; worstScore = score; }
  }
  return worst || hand[0];
}

function makeTrioCandidates(cards) {
  const jokers = cards.filter(c => c.isJoker);
  const byValue = new Map();
  for (const c of cards) {
    if (c.isJoker) continue;
    if (!byValue.has(c.value)) byValue.set(c.value, []);
    byValue.get(c.value).push(c);
  }
  const candidates = [];
  for (const [, realCards] of byValue) {
    // Prefer legal trio groups of 3+, not only exactly 3. This lets the bot
    // recognize/open with a larger same-value group when that is the selected
    // best contract.
    const maxSize = realCards.length + jokers.length;
    for (let groupSize = 3; groupSize <= maxSize; groupSize++) {
      for (let realCount = Math.max(1, groupSize - jokers.length); realCount <= Math.min(groupSize, realCards.length); realCount++) {
        const needed = groupSize - realCount;
        if (needed > jokers.length) continue;
        for (const realCombo of combinations(realCards, realCount)) {
          candidates.push({ type:"trio", cards:[...realCombo, ...jokers.slice(0, needed)] });
        }
      }
    }
  }
  return candidates;
}

function makeSequenceCandidates(cards) {
  const jokers = cards.filter(c => c.isJoker);
  const candidates = [];
  for (const suit of SUITS) {
    const suited = cards.filter(c => !c.isJoker && c.suit === suit);
    if (!suited.length) continue;
    const buildForMode = (mode, minRank, maxRank) => {
      const byRank = new Map();
      for (const c of suited) {
        const rank = mode === "high" && c.value === "A" ? 13 : VALUE_RANK[c.value];
        if (rank < minRank || rank > maxRank) continue;
        if (!byRank.has(rank)) byRank.set(rank, []);
        byRank.get(rank).push(c);
      }
      for (let start = minRank; start <= maxRank; start++) {
        for (let end = start + 3; end <= maxRank; end++) {
          const len = end - start + 1;
          let missing = 0;
          const chosen = [];
          for (let r = start; r <= end; r++) {
            const arr = byRank.get(r);
            if (arr?.length) chosen.push(arr[0]); else missing++;
          }
          if (missing > jokers.length || chosen.length === 0) continue;
          const seqCards = [...chosen, ...jokers.slice(0, missing)];
          if (seqCards.length === len && isValidSequence(seqCards)) candidates.push({ type:"seq", cards:orderSequenceCards(seqCards) });
        }
      }
    };
    buildForMode("low", 0, 12);
    buildForMode("high", 1, 13);
  }
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.cards.map(x => x.id).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findContractMelds(cards, round) {
  const { trios:tc, seqs:sc } = round;
  const types = [...Array(tc).fill("trio"), ...Array(sc).fill("seq")];
  const minRequired = tc * 3 + sc * 4;
  if (!cards || cards.length < minRequired) return { valid:false, melds:[], reason:"" };
  const candidatesByType = { trio: makeTrioCandidates(cards), seq: makeSequenceCandidates(cards) };
  const cardScore = c => c.isJoker ? 35 : cardPoints(c);
  for (const type of ["trio", "seq"]) {
    candidatesByType[type].sort((a,b) => {
      const lenDiff = a.cards.length - b.cards.length;
      if (lenDiff) return lenDiff;
      const sa = a.cards.reduce((sum,c)=>sum+cardScore(c),0);
      const sb = b.cards.reduce((sum,c)=>sum+cardScore(c),0);
      return sa - sb;
    });
  }
  function search(idx, used, melds) {
    if (idx === types.length) return melds;
    const type = types[idx];
    for (const candidate of candidatesByType[type]) {
      if (candidate.cards.some(c => used.has(c.id))) continue;
      const nextUsed = new Set(used);
      candidate.cards.forEach(c => nextUsed.add(c.id));
      const found = search(idx + 1, nextUsed, [...melds, normalizeMeldGroup(candidate)]);
      if (found) return found;
    }
    return null;
  }
  const melds = search(0, new Set(), []);
  return melds ? { valid:true, melds, reason:"" } : { valid:false, melds:[], reason:"" };
}

export function shouldBotBuyContra(hand, discardTop, round, costsPenalty = true) {
  if (!discardTop) return false;
  if (discardTop.isJoker) return true;
  if (findContractMelds([...hand, discardTop], round).valid) return true;
  const direct = evaluateCardUtility(discardTop, [...hand, discardTop], round);
  const sameValue = hand.filter(c => !c.isJoker && c.value === discardTop.value).length;
  const near = hand.filter(c => !c.isJoker && c.suit === discardTop.suit).some(c => Math.abs(VALUE_RANK[c.value] - VALUE_RANK[discardTop.value]) <= 2);
  if (round.trios > 0 && sameValue >= 2) return true;
  if (round.seqs > 0 && near && direct >= (costsPenalty ? 18 : 10)) return true;
  return direct >= (costsPenalty ? 26 : 14);
}

export function tryAutoPlaceOnMelds(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player?.hasDropped || !player.cards.length) return game;
  let changed = true;
  while (changed) {
    changed = false;
    for (const card of [...player.cards]) {
      let placed = false;
      for (const target of game.players) {
        if (!target.hasDropped) continue;
        for (const group of target.meldedGroups) {
          if (canAddCardToMeld(group, card)) {
            group.cards.push(card);
            target.meldedGroups = target.meldedGroups.map(g => normalizeMeldGroup(g));
            player.cards = player.cards.filter(c => c.id !== card.id);
            changed = true; placed = true; break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
    }
  }
  return game;
}
