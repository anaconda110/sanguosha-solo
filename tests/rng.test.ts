// rng.ts：种子确定性（ADR-0002）——同 seed 同序列，种子随状态就地更新。
import { describe, expect, it } from 'vitest';
import { randU32, shuffleInPlace } from '../src/engine/rng';

function seq(seed: number, n: number): number[] {
  const state = { seed };
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(randU32(state));
  return out;
}

describe('randU32 种子确定性', () => {
  it('同 seed 产出完全相同的序列（含算法基准值）', () => {
    const a = seq(0, 5);
    const b = seq(0, 5);
    expect(a).toEqual(b);
    // mulberry32 基准：钉死算法实现，防止无意改动破坏回放可复现性
    expect(a).toEqual([1144304738, 1416247, 958946056, 627933444, 2007157716]);
  });

  it('不同 seed 产出不同序列', () => {
    expect(seq(12345, 5)).not.toEqual(seq(0, 5));
    // 参考：seed 12345 的首序列，保证常见种子路径也被钉住
    expect(seq(12345, 5)).toEqual([4207900869, 1317490944, 2079646450, 3513001552, 2187978186]);
  });

  it('返回 32 位无符号整数，且就地推进种子', () => {
    const state = { seed: 0 };
    for (let i = 0; i < 20; i++) {
      const v = randU32(state);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
    const before = state.seed;
    randU32(state);
    expect(state.seed).not.toBe(before); // 种子必须随状态一起变化（存进 GameState 才能重放）
  });
});

describe('shuffleInPlace', () => {
  it('同 seed 对同内容数组产生同一置换（可复现）', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffleInPlace({ seed: 42 }, a);
    shuffleInPlace({ seed: 42 }, b);
    expect(a).toEqual(b);
    expect(a).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 确实发生了置换
  });

  it('洗牌后元素多重集与长度不变', () => {
    const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 11, 22];
    const copy = [...arr];
    shuffleInPlace({ seed: 7 }, arr);
    expect(arr).toHaveLength(copy.length);
    expect([...arr].sort((x, y) => x - y)).toEqual([...copy].sort((x, y) => x - y));
  });
});
