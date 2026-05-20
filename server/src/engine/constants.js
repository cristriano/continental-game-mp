export const ROUNDS = [
  { index:0, label:"Mão 1", code:"TT",  goalPT:"2 Trios",               cards:7,  trios:2, seqs:0 },
  { index:1, label:"Mão 2", code:"TR",  goalPT:"1 Trio + 1 Sequência",  cards:8,  trios:1, seqs:1 },
  { index:2, label:"Mão 3", code:"RR",  goalPT:"2 Sequências",           cards:9,  trios:0, seqs:2 },
  { index:3, label:"Mão 4", code:"TTT", goalPT:"3 Trios",               cards:10, trios:3, seqs:0 },
  { index:4, label:"Mão 5", code:"TTR", goalPT:"2 Trios + 1 Sequência", cards:11, trios:2, seqs:1 },
  { index:5, label:"Mão 6", code:"TRR", goalPT:"1 Trio + 2 Sequências", cards:12, trios:1, seqs:2 },
  { index:6, label:"Mão 7", code:"RRR", goalPT:"3 Sequências",           cards:13, trios:0, seqs:3 },
];

export const SUITS = ["♠","♥","♦","♣"];
export const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const VALUE_RANK = Object.fromEntries(VALUES.map((v,i)=>[v,i]));
export const TURN_ORDER_DEFAULT = ["seat1","seat4","seat3","seat2"];

export const PHASE = {
  LOBBY:"lobby",
  DRAW:"draw",
  DISCARD:"discard",
  BOT:"bot",
  CONTRA:"contra",
  ROUND_END:"round_end",
  GAME_END:"game_end",
};
