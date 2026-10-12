// setup(seed) 初始局不变量。依据 src/engine/setup.ts 通读确认：
//   - 身份：0 号位恒为主公，['zhong','fan','fan','nei'] 洗牌分给 1-4 号（setup.ts:73-88）
//   - 发牌：4 轮 × 5 人，每人 4 张，主公不多摸（setup.ts:91-93；主公位只加体力 hpOf +1，setup.ts:40-42）
//   - setup 末尾 advance(st)（setup.ts:95）会把主公的回合推进到第一个决策点：
//     观星/洛神/突袭/裸衣停在摸牌前（手牌仍 4 张），其余武将的摸牌阶段已被自动结算
//     （step.ts advance：draw → drawPhaseDefault 摸 2 张，周瑜英姿再 +1）→ 手牌 6/7 张。
// 因此"初始手牌数"以返回状态为准分两种情形断言；牌堆守恒式按 TOTAL_CARDS 校验。
import { describe, expect, it } from 'vitest';
import { setup } from '../src/engine/setup';
import { TOTAL_CARDS } from '../src/engine/cards';
import type { GameState, Identity } from '../src/engine/types';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function handSum(s: GameState): number {
  return s.players.reduce((n, p) => n + p.hand.length, 0);
}

function identityCount(ids: Identity[], id: Identity): number {
  return ids.filter(x => x === id).length;
}

describe('setup 初始局不变量', () => {
  it('5 名玩家，全员存活', () => {
    for (const seed of SEEDS) {
      const s = setup(seed);
      expect(s.players).toHaveLength(5);
      expect(s.players.map(p => p.alive)).toEqual([true, true, true, true, true]);
    }
  });

  it('身份分布 1 主 1 忠 2 反 1 内，主公固定 0 号位', () => {
    for (const seed of SEEDS) {
      const s = setup(seed);
      const ids = s.players.map(p => p.identity);
      expect(ids[0]).toBe('zhu');
      expect(identityCount(ids, 'zhu')).toBe(1);
      expect(identityCount(ids, 'zhong')).toBe(1);
      expect(identityCount(ids, 'fan')).toBe(2);
      expect(identityCount(ids, 'nei')).toBe(1);
    }
  });

  it('座位 1-4 恰好 4 张起手；主公发牌同为 4 张（不多摸），advance 可能已替其完成摸牌阶段', () => {
    for (const seed of SEEDS) {
      const s = setup(seed);
      for (const p of s.players.slice(1)) {
        expect(p.hand).toHaveLength(4);
      }
      const lord = s.players[0]!;
      expect(['guanxing', 'trigger', 'drawPhase', 'play']).toContain(s.pending!.kind);
      if (s.pending!.kind === 'play') {
        // 摸牌阶段已被 advance 自动结算：+2（周瑜英姿再 +1，见 skills/yingzi.ts）
        expect(lord.hand).toHaveLength(4 + 2 + (lord.general === 'zhouyu' ? 1 : 0));
      } else {
        // 观星（zhugeliang）/洛神触发（zhenji）/摸牌抉择（xuchu、zhangliao）：停在摸牌前
        expect(lord.hand).toHaveLength(4);
      }
    }
  });

  it('judgements 与 equipment 均空', () => {
    for (const seed of SEEDS) {
      const s = setup(seed);
      for (const p of s.players) {
        expect(p.judgements).toEqual([]);
        expect(p.equipment).toEqual({});
      }
    }
  });

  it('牌堆数 = TOTAL_CARDS − 手牌总和（弃牌堆为空；观星翻看的牌悬在询问里需扣除）', () => {
    let strictChecked = 0;
    for (const seed of SEEDS) {
      const s = setup(seed);
      expect(s.discard).toEqual([]);
      if (s.pending?.kind === 'guanxing') {
        // skills/guanxing.ts preparePhase：翻看的牌已离开牌堆、尚未归位
        const shown = s.pending.guanxingCards?.length ?? 0;
        expect(shown).toBeGreaterThan(0);
        expect(s.deck.length).toBe(TOTAL_CARDS - handSum(s) - shown);
      } else {
        expect(s.deck.length).toBe(TOTAL_CARDS - handSum(s));
        strictChecked += 1;
      }
    }
    expect(strictChecked).toBeGreaterThan(0);
  });

  it('seed 决定性：同 seed 两次 setup，玩家（含手牌）完全一致', () => {
    for (const seed of [42, 7, 2026]) {
      const a = setup(seed);
      const b = setup(seed);
      expect(a.players.map(p => p.hand.map(c => c.id))).toEqual(b.players.map(p => p.hand.map(c => c.id)));
      expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
      expect(a.deck.map(c => c.id)).toEqual(b.deck.map(c => c.id));
    }
  });
});
