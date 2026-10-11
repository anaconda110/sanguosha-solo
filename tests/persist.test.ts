// persist.ts：localStorage 存档（M15）——往返、坏数据容错、配额溢出截断 log 退化。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSave, hasSave, loadSave, saveGame } from '../src/persist';
import type { GameState } from '../src/engine/types';
import { makePlayer } from './helpers';

/** Map 背书的 localStorage 桩：可模拟配额溢出（setItem 抛 QuotaExceededError） */
function makeLS(opts: { failFirstSet?: boolean; failAllSet?: boolean } = {}) {
  const store = new Map<string, string>();
  let setCalls = 0;
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      setCalls += 1;
      if (opts.failAllSet || (opts.failFirstSet && setCalls === 1)) {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

function makeState(log: GameState['log']): GameState {
  return {
    seed: 42, deck: [], discard: [],
    players: [makePlayer(0, 'baiban', 'zhu'), makePlayer(1, 'baiban', 'fan')],
    turnIdx: 0, turnCount: 3, phase: 'play', playedSha: false, turnPlays: 1,
    judging: false, skipDraw: false, skipPlay: false, damageBonus: 0, shaUsed: false,
    drawPhaseAsked: false, prepared: false, usedSkills: [], frames: [], frameSeq: 0,
    triggerQueue: [], judgeState: null, pending: null, log, actionLog: [{ type: 'endPlay' }],
    winner: null,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLS());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSave', () => {
  it('无存档时返回 null 且 hasSave 为 false', () => {
    expect(loadSave()).toBeNull();
    expect(hasSave()).toBe(false);
  });

  it('存/读往返：字段与状态完整还原', () => {
    const state = makeState([{ t: 'draw', player: 0, n: 2 }]);
    saveGame({ seed: 42, humanId: 0, spectate: false, state });
    expect(hasSave()).toBe(true);
    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.seed).toBe(42);
    expect(loaded!.humanId).toBe(0);
    expect(loaded!.spectate).toBe(false);
    expect(loaded!.savedAt).toBeGreaterThan(0);
    expect(loaded!.state.seed).toBe(42);
    expect(loaded!.state.players).toHaveLength(2);
    expect(loaded!.state.actionLog).toEqual([{ type: 'endPlay' }]);
    expect(loaded!.state.log).toEqual([{ t: 'draw', player: 0, n: 2 }]);
  });

  it('版本不符或 JSON 损坏时返回 null，不抛异常', () => {
    const state = makeState([]);
    saveGame({ seed: 1, humanId: 0, spectate: false, state });
    // 人为改坏版本号
    const raw = JSON.parse(localStorage.getItem('sanguosha-solo:save')!);
    raw.version = 999;
    localStorage.setItem('sanguosha-solo:save', JSON.stringify(raw));
    expect(loadSave()).toBeNull();
    // 坏 JSON
    localStorage.setItem('sanguosha-solo:save', '{oops');
    expect(loadSave()).toBeNull();
  });
});

describe('saveGame 配额退化', () => {
  it('首次写入溢出时退化：截断 log 到最近 300 条，actionLog 保完整', () => {
    vi.stubGlobal('localStorage', makeLS({ failFirstSet: true }));
    const bigLog = Array.from({ length: 500 }, (_, i) => ({ t: 'draw' as const, player: i, n: 2 }));
    saveGame({ seed: 1, humanId: 0, spectate: false, state: makeState(bigLog) });
    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.state.log).toHaveLength(300);
    expect(loaded!.state.log[0]).toEqual({ t: 'draw', player: 200, n: 2 }); // 保留的是最近 300 条
    expect(loaded!.state.actionLog).toEqual([{ type: 'endPlay' }]);
  });

  it('完全写不进时静默放弃：不抛异常，不留下半截存档', () => {
    vi.stubGlobal('localStorage', makeLS({ failAllSet: true }));
    expect(() =>
      saveGame({ seed: 1, humanId: 0, spectate: false, state: makeState([{ t: 'draw', player: 0, n: 2 }]) }),
    ).not.toThrow();
    expect(hasSave()).toBe(false);
  });
});

describe('clearSave', () => {
  it('清除后 hasSave 变 false，再读为 null', () => {
    saveGame({ seed: 1, humanId: 0, spectate: false, state: makeState([]) });
    expect(hasSave()).toBe(true);
    clearSave();
    expect(hasSave()).toBe(false);
    expect(loadSave()).toBeNull();
  });
});
