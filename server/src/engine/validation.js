import { VALUE_RANK } from "./constants.js";

function combinations(arr,k) {
  if (k === 0) return [[]];
  if (arr.length < k || k < 0) return [];
  if (k === arr.length) return [arr];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest,k-1).map(c => [first, ...c]),
    ...combinations(rest,k),
  ];
}

export function isValidTrio(cards) {
  // A trio must start with at least 3 cards, but after/while opening it may
  // contain extra cards of the same value. Exact duplicate cards are allowed
  // because the game uses multiple decks: 6♦ + 6♦ + 6♠ is valid.
  // Example: 10-10-10-10 is still a valid trio group. Jokers can be part
  // of the group, but at least one real card is required to define the value.
  if (!cards || cards.length < 3) return false;
  const real = cards.filter(c => !c.isJoker);
  if (real.length === 0) return false;
  return new Set(real.map(c => c.value)).size === 1;
}

function getLinearSequenceModes(ranks, jokers, totalCards, minRank, maxRank) {
  if (new Set(ranks).size !== ranks.length) return [];
  const sorted = [...ranks].sort((a,b)=>a-b);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) gaps += sorted[i] - sorted[i-1] - 1;
  if (gaps > jokers) return [];
  const span = sorted[sorted.length-1] - sorted[0] + 1;
  const extra = jokers - gaps;
  if (span + extra !== totalCards) return [];
  const modes = [];
  for (let leftExtra = 0; leftExtra <= extra; leftExtra++) {
    const rightExtra = extra - leftExtra;
    const start = sorted[0] - leftExtra;
    const end = sorted[sorted.length-1] + rightExtra;
    if (start < minRank || end > maxRank) continue;
    modes.push({ start, end, leftExtra, rightExtra, gaps });
  }
  return modes;
}

export function getSequenceModes(cards) {
  if (!cards || cards.length < 4) return [];
  const real = cards.filter(c => !c.isJoker);
  const jokers = cards.length - real.length;
  if (real.length === 0) return [];
  if (new Set(real.map(c => c.suit)).size !== 1) return [];
  const modes = [];
  const lowRanks = real.map(c => VALUE_RANK[c.value]);
  for (const low of getLinearSequenceModes(lowRanks, jokers, cards.length, 0, 12)) {
    modes.push({ mode:"low", ...low, closed: low.start === 0 && low.end === 12 });
  }
  const highRanks = real.map(c => c.value === "A" ? 13 : VALUE_RANK[c.value]);
  for (const high of getLinearSequenceModes(highRanks, jokers, cards.length, 1, 13)) {
    modes.push({ mode:"high", ...high, closed: high.start === 1 && high.end === 13 });
  }
  return modes;
}

export function isValidSequence(cards) { return getSequenceModes(cards).length > 0; }
export function isSequenceClosed(cards) { return getSequenceModes(cards).some(m => m.closed); }

function getSequenceModeRank(card, mode) {
  if (!card || card.isJoker) return null;
  if (mode === "high" && card.value === "A") return 13;
  return VALUE_RANK[card.value];
}

export function orderSequenceCards(cards) {
  const modes = getSequenceModes(cards);
  if (!modes.length) return [...cards];
  const real = cards.filter(c => !c.isJoker);
  const jokers = cards.filter(c => c.isJoker);
  const preferredSide = jokers.find(j => j.__seqSide)?.__seqSide || null;
  const chosen = [...modes].sort((a,b) => {
    if (preferredSide === "left") {
      const diff = (b.leftExtra || 0) - (a.leftExtra || 0);
      if (diff) return diff;
    }
    if (preferredSide === "right") {
      const diff = (b.rightExtra || 0) - (a.rightExtra || 0);
      if (diff) return diff;
    }
    const aHigh = a.mode === "high" && real.some(c => c.value === "A");
    const bHigh = b.mode === "high" && real.some(c => c.value === "A");
    if (aHigh !== bHigh) return aHigh ? -1 : 1;
    return (a.end - a.start) - (b.end - b.start);
  })[0];
  const byRank = new Map();
  for (const c of real) byRank.set(getSequenceModeRank(c, chosen.mode), c);
  let ji = 0;
  const ordered = [];
  for (let r = chosen.start; r <= chosen.end; r++) {
    if (byRank.has(r)) ordered.push(byRank.get(r));
    else if (ji < jokers.length) ordered.push(jokers[ji++]);
  }
  while (ji < jokers.length) ordered.push(jokers[ji++]);
  return ordered.map(({__seqSide, ...c}) => c);
}

export function normalizeMeldGroup(group) {
  if (!group) return group;
  if (group.type === "seq") return { ...group, cards: orderSequenceCards(group.cards || []) };
  return { ...group, cards: [...(group.cards || [])] };
}

export function canAddCardToMeld(group, card) {
  if (!group || !card) return false;
  const current = group.cards || [];
  const cards = [...current, card];
  if (group.type === "trio") {
    const real = cards.filter(c => !c.isJoker);
    return real.length > 0 && new Set(real.map(c => c.value)).size === 1;
  }
  if (isSequenceClosed(current)) return false;
  const beforeModes = getSequenceModes(current);
  const afterModes = getSequenceModes(cards);
  if (!afterModes.length) return false;
  const beforeModeNames = new Set(beforeModes.map(m => m.mode));
  if (beforeModeNames.size === 1) {
    const only = [...beforeModeNames][0];
    return afterModes.some(m => m.mode === only);
  }
  return true;
}

export function validateContract(cards, round) {
  const { trios: tc, seqs: sc } = round;
  const minRequired = tc * 3 + sc * 4;
  if (!cards || cards.length < minRequired) return { valid:false, melds:[], reason:"Cartas insuficientes para o contrato." };
  if (cards.length > 18) return { valid:false, melds:[], reason:"Selecione apenas as cartas do contrato." };
  const types = [...Array(tc).fill("trio"), ...Array(sc).fill("seq")];
  const minForRemaining = start => types.slice(start).reduce((sum,t)=>sum+(t==="trio"?3:4),0);
  function tryPartition(rem, gi, groups) {
    if (gi === types.length) return rem.length === 0 ? groups : null;
    const type = types[gi];
    const minSize = type === "trio" ? 3 : 4;
    const max = type === "trio" ? rem.length - minForRemaining(gi+1) : rem.length - minForRemaining(gi+1);
    if (max < minSize) return null;
    const sizes = type === "trio"
      ? Array.from({ length:max-2 },(_,i)=>i+3)
      : Array.from({ length:max-3 },(_,i)=>i+4);
    for (const sz of sizes) {
      for (const combo of combinations(rem, sz)) {
        const valid = type === "trio" ? isValidTrio(combo) : isValidSequence(combo);
        if (!valid) continue;
        const rest = rem.filter(c => !combo.includes(c));
        const r = tryPartition(rest, gi+1, [...groups, normalizeMeldGroup({ type, cards:combo })]);
        if (r) return r;
      }
    }
    return null;
  }
  const result = tryPartition([...cards], 0, []);
  return result ? { valid:true, melds:result, reason:"" } : { valid:false, melds:[], reason:"As cartas não formam o contrato desta mão." };
}

export { combinations };
