// cards.ts：牌组常量与结构合法性（M2/M13：113+4 = 117 张）。
import { describe, expect, it } from 'vitest';
import { buildDeck, TOTAL_CARDS } from '../src/engine/cards';
import { CARD_INFO } from '../src/engine/types';

describe('buildDeck / TOTAL_CARDS', () => {
  it('TOTAL_CARDS 为 117 且与 buildDeck().length 一致', () => {
    expect(TOTAL_CARDS).toBe(117);
    expect(TOTAL_CARDS).toBe(buildDeck().length);
  });

  it('牌 id 唯一且连续（0..TOTAL_CARDS-1）', () => {
    const deck = buildDeck();
    const ids = deck.map(c => c.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: TOTAL_CARDS }, (_, i) => i));
  });

  it('基础牌分布：杀 30 / 闪 18 / 桃 12', () => {
    const deck = buildDeck();
    const count = (sub: string) => deck.filter(c => c.sub === sub).length;
    expect(count('sha')).toBe(30);
    expect(count('shan')).toBe(18);
    expect(count('tao')).toBe(12);
  });

  it('按 CARD_INFO 的 kind 分布：基础 60 / 锦囊 40 / 装备 17', () => {
    const deck = buildDeck();
    const byKind = { basic: 0, trick: 0, equip: 0 } as Record<string, number>;
    for (const c of deck) byKind[CARD_INFO[c.sub]!.kind]! += 1;
    expect(byKind).toEqual({ basic: 60, trick: 40, equip: 17 });
  });

  it('每张牌花色合法；桃全红；杀四花色齐备', () => {
    const deck = buildDeck();
    const suits = new Set(['♠', '♥', '♣', '♦']);
    for (const c of deck) expect(suits.has(c.suit)).toBe(true);
    expect(deck.filter(c => c.sub === 'tao').every(c => c.suit === '♥' || c.suit === '♦')).toBe(true);
    const shaSuits = new Set(deck.filter(c => c.sub === 'sha').map(c => c.suit));
    expect(shaSuits).toEqual(suits);
  });
});
