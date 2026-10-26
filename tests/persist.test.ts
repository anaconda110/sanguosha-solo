// persist.ts：localStorage 存档（M15）——往返、坏数据容错、配额溢出截断 log 退化。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_SLOT_IDS,
  clearSave,
  deleteSaveSlot,
  hasSave,
  hasSaveSlot,
  listSaveSlots,
  loadSave,
  loadSaveSlot,
  saveGame,
  saveToSlot,
} from '../src/persist';
import type { GameState } from '../src/engine/types';
import { makePlayer } from './helpers';

/** Map 背书的 localStorage 桩：可模拟配额溢出（setItem 抛 QuotaExceededError） */
function makeLS(opts: { failFirstSet?: boolean; failAllSet?: boolean; failAfterSets?: number } = {}) {
  const store = new Map<string, string>();
  let setCalls = 0;
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      setCalls += 1;
      if (
        opts.failAllSet ||
        (opts.failFirstSet && setCalls === 1) ||
        (opts.failAfterSets != null && setCalls > opts.failAfterSets)
      ) {
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


describe('三槽手动存档', () => {
  it('默认三个槽位独立增删读写，摘要与读取结果一致', () => {
    expect(SAVE_SLOT_IDS).toEqual(['1', '2', '3']);

    for (const [index, id] of SAVE_SLOT_IDS.entries()) {
      const state = makeState([{ t: 'draw', player: index, n: index + 1 }]);
      state.seed = 100 + index;
      expect(saveToSlot(id, { seed: state.seed, humanId: index, spectate: index === 2, state })).toBe(true);
    }

    const slots = listSaveSlots();
    expect(slots.map(slot => slot.id)).toEqual(['1', '2', '3']);
    expect(slots.map(slot => slot.exists)).toEqual([true, true, true]);
    expect(slots.map(slot => slot.seed)).toEqual([100, 101, 102]);
    expect(slots.map(slot => slot.humanId)).toEqual([0, 1, 2]);
    expect(slots.map(slot => slot.spectate)).toEqual([false, false, true]);
    expect(loadSaveSlot('1')!.state.log).toEqual([{ t: 'draw', player: 0, n: 1 }]);
    expect(loadSaveSlot('3')!.state.log).toEqual([{ t: 'draw', player: 2, n: 3 }]);

    deleteSaveSlot('2');
    expect(hasSaveSlot('2')).toBe(false);
    expect(loadSaveSlot('2')).toBeNull();
    expect(loadSaveSlot('1')).not.toBeNull();
    expect(loadSaveSlot('3')).not.toBeNull();
    expect(listSaveSlots().map(slot => slot.exists)).toEqual([true, false, true]);
  });

  it('空槽与损坏槽都表现为空槽，菜单读取不抛异常', () => {
    expect(hasSaveSlot('1')).toBe(false);
    expect(loadSaveSlot('1')).toBeNull();
    expect(listSaveSlots().every(slot => !slot.exists)).toBe(true);

    localStorage.setItem('sanguosha-solo:slot:1', '{broken');
    localStorage.setItem('sanguosha-solo:slot:2', JSON.stringify({ version: 999, state: { players: [] } }));
    localStorage.setItem('sanguosha-solo:slot:3', JSON.stringify({ version: 1, state: {} }));

    expect(() => listSaveSlots()).not.toThrow();
    expect(listSaveSlots().map(slot => slot.exists)).toEqual([false, false, false]);
    expect(loadSaveSlot('1')).toBeNull();
    expect(hasSaveSlot('2')).toBe(true); // has 只检查键存在；具体内容由 load 容错
  });

  it('手动槽与自动续局槽互不影响', () => {
    const auto = makeState([{ t: 'draw', player: 0, n: 2 }]);
    auto.seed = 11;
    saveGame({ seed: 11, humanId: 0, spectate: false, state: auto });
    expect(saveToSlot('1', { seed: 11, humanId: 0, spectate: false, state: auto })).toBe(true);

    clearSave();
    expect(loadSave()).toBeNull();
    expect(loadSaveSlot('1')!.seed).toBe(11);

    saveGame({ seed: 12, humanId: 1, spectate: true, state: { ...auto, seed: 12 } });
    deleteSaveSlot('1');
    expect(loadSaveSlot('1')).toBeNull();
    expect(loadSave()!.seed).toBe(12);
  });

  it('配额失败返回 false，旧槽内容保持不变', () => {
    vi.stubGlobal('localStorage', makeLS({ failAfterSets: 1 }));
    const first = makeState([{ t: 'draw', player: 0, n: 1 }]);
    first.seed = 21;
    expect(saveToSlot('1', { seed: 21, humanId: 0, spectate: false, state: first })).toBe(true);
    const before = localStorage.getItem('sanguosha-solo:slot:1');

    const second = makeState([{ t: 'draw', player: 1, n: 2 }]);
    second.seed = 22;
    expect(saveToSlot('1', { seed: 22, humanId: 1, spectate: true, state: second })).toBe(false);

    expect(localStorage.getItem('sanguosha-solo:slot:1')).toBe(before);
    expect(loadSaveSlot('1')!.seed).toBe(21);
    expect(loadSaveSlot('1')!.state.log).toEqual([{ t: 'draw', player: 0, n: 1 }]);
  });

  it('手动槽首次溢出时截断 log 后成功，并完整保留 actionLog', () => {
    vi.stubGlobal('localStorage', makeLS({ failFirstSet: true }));
    const state = makeState(Array.from({ length: 500 }, (_, i) => ({ t: 'draw' as const, player: i, n: 2 })));
    expect(saveToSlot('3', { seed: 31, humanId: 2, spectate: false, state })).toBe(true);

    const loaded = loadSaveSlot('3');
    expect(loaded).not.toBeNull();
    expect(loaded!.state.log).toHaveLength(300);
    expect(loaded!.state.log[0]).toEqual({ t: 'draw', player: 200, n: 2 });
    expect(loaded!.state.actionLog).toEqual([{ type: 'endPlay' }]);
  });
});
