import type { Card, CardSub, Suit } from './types';

// M2 牌堆：113 张，类型构成对齐标准版思路（基础 60 / 锦囊 36 / 装备 17），
// 非严格标准 108（ADR-0005）。点数与花色仅展示与判定用色，桃全红。
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  const push = (sub: CardSub, suit: Suit, rank: number) => deck.push({ id: id++, sub, suit, rank });
  // 基础 60：杀30 闪18 桃12
  for (let i = 0; i < 7; i++) push('sha', '♠', (i % 13) + 1);
  for (let i = 0; i < 14; i++) push('sha', '♣', (i % 13) + 1);
  for (let i = 0; i < 4; i++) push('sha', '♥', (i % 13) + 1);
  for (let i = 0; i < 5; i++) push('sha', '♦', (i % 13) + 1);
  for (let i = 0; i < 10; i++) push('shan', '♦', (i % 13) + 1);
  for (let i = 0; i < 5; i++) push('shan', '♥', (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('shan', '♠', (i % 13) + 1);
  for (let i = 0; i < 8; i++) push('tao', '♥', (i % 13) + 1);
  for (let i = 0; i < 4; i++) push('tao', '♦', (i % 13) + 1);
  // 锦囊 36
  for (let i = 0; i < 4; i++) push('wuzhong', i % 2 === 0 ? '♥' : '♦', (i % 13) + 1);
  for (let i = 0; i < 6; i++) push('guohe', i % 2 === 0 ? '♠' : '♣', (i % 13) + 1);
  for (let i = 0; i < 5; i++) push('shunshou', (['♠', '♦', '♣'] as const)[i % 3], (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('juedou', i % 2 === 0 ? '♠' : '♣', (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('nanman', '♠', (i % 13) + 1);
  push('wanjian', '♥', 1);
  push('taoyuan', '♥', 1);
  for (let i = 0; i < 5; i++) push('wuxie', (['♠', '♣', '♥'] as const)[i % 3], (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('lebusi', i % 2 === 0 ? '♠' : '♥', (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('bingliang', '♣', (i % 13) + 1);
  for (let i = 0; i < 2; i++) push('shandian', i % 2 === 0 ? '♠' : '♥', (i % 13) + 1);
  // 装备 17：武器9（含连弩×2）+ 八卦阵2 + 坐骑6
  push('liannu', '♣', 1);
  push('liannu', '♦', 1);
  push('qinggang', '♠', 6);
  push('cixiong', '♠', 2);
  push('qinglong', '♠', 5);
  push('zhangba', '♠', 12);
  push('guanshi', '♠', 9);
  push('fangtian', '♦', 12);
  push('qilin', '♥', 5);
  push('bagua', '♠', 2);
  push('bagua', '♣', 2);
  for (let i = 0; i < 3; i++) push('jia1ma', '♥', (i % 13) + 1);
  for (let i = 0; i < 3; i++) push('jian1ma', '♦', (i % 13) + 1);
  return deck;
}

export const TOTAL_CARDS = buildDeck().length;
