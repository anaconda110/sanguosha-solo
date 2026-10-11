// belief.ts：身份推断的行为打分（ADR-0003/M12）——只读公开日志，纯函数。
import { describe, expect, it } from 'vitest';
import { inferLordFavor, SIDE_OF, stanceOf, THRESHOLD } from '../src/ai/belief';
import type { GameEvent, GameState } from '../src/engine/types';
import { makePlayer } from './helpers';

function makeGame(log: GameEvent[], withLord = true): GameState {
  const players = [
    makePlayer(0, 'baiban', 'zhu'),
    makePlayer(1, 'baiban', 'zhong'),
    makePlayer(2, 'baiban', 'fan'),
    makePlayer(3, 'baiban', 'nei'),
  ];
  if (!withLord) return { players: players.map(p => ({ ...p, identity: 'fan' as const })), log } as unknown as GameState;
  return {
    seed: 1, deck: [], discard: [], players,
    turnIdx: 0, turnCount: 0, phase: 'play', playedSha: false, turnPlays: 0,
    judging: false, skipDraw: false, skipPlay: false, damageBonus: 0, shaUsed: false,
    drawPhaseAsked: false, prepared: false, usedSkills: [], frames: [], frameSeq: 0,
    triggerQueue: [], judgeState: null, pending: null, log, actionLog: [], winner: null,
  };
}

describe('inferLordFavor', () => {
  it('无主公时全员为 0（推断退回保守策略）', () => {
    const favor = inferLordFavor(makeGame([{ t: 'playCard', player: 1, card: 'sha', target: 2 }], false));
    expect(favor).toEqual([0, 0, 0, 0]);
  });

  it('单目标 HOSTILE 牌指向主公 +2；非 HOSTILE 牌与群体锦囊不计分', () => {
    const favor = inferLordFavor(makeGame([
      { t: 'playCard', player: 2, card: 'sha', target: 0 },
      { t: 'playCard', player: 3, card: 'shunshou', target: 0 },
    ]));
    expect(favor).toEqual([0, 0, 2, 2]);

    const noScore = inferLordFavor(makeGame([
      { t: 'playCard', player: 2, card: 'shan', target: 0 }, // 非 HOSTILE
      { t: 'playCard', player: 3, card: 'nanman', targets: [1, 2, 3] }, // 群体锦囊不判
      { t: 'playCard', player: 1, card: 'tao', target: 0 },
    ]));
    expect(noScore).toEqual([0, 0, 0, 0]);
  });

  it('主公自己的动作不构成身份证据', () => {
    const favor = inferLordFavor(makeGame([
      { t: 'playCard', player: 0, card: 'sha', target: 2 },
      { t: 'death', player: 2, identity: 'fan', killer: 0 },
    ]));
    expect(favor).toEqual([0, 0, 0, 0]);
  });

  it('死亡结算：杀反贼/内奸 -2，杀忠臣 +2，主公为凶手不计', () => {
    const favor = inferLordFavor(makeGame([
      { t: 'death', player: 4, identity: 'fan', killer: 1 },
      { t: 'death', player: 5, identity: 'nei', killer: 2 },
      { t: 'death', player: 6, identity: 'zhong', killer: 3 },
      { t: 'death', player: 7, identity: 'zhong', killer: 0 },
    ]));
    expect(favor).toEqual([0, -2, -2, 2]);
  });

  it('救援归因：为濒死主公出桃/青囊（紧跟 heal 主公）-2，且只归因一次', () => {
    const favor = inferLordFavor(makeGame([
      { t: 'respond', player: 1, card: 'tao', resp: 'tao' },
      { t: 'heal', player: 0, amount: 1 },
      { t: 'heal', player: 0, amount: 1 }, // 无新施救者，不再归因
    ]));
    expect(favor).toEqual([0, -2, 0, 0]);

    const qingnang = inferLordFavor(makeGame([
      { t: 'skill', player: 2, sub: 'qingnang' },
      { t: 'heal', player: 0, amount: 1 },
    ]));
    expect(qingnang).toEqual([0, 0, -2, 0]);
  });

  it('无懈链第一张：抵消指向主公的进攻锦囊 -1.5；抵消主公的增益锦囊 +1.5；反无懈（chain≠1）与非主公目标不计', () => {
    const favor = inferLordFavor(makeGame([
      { t: 'negate', player: 1, sub: 'shunshou', targetId: 0, chain: 1 },
      { t: 'negate', player: 2, sub: 'sha', targetId: 0, chain: 2 }, // 反无懈不归因
    ]));
    expect(favor).toEqual([0, -1.5, 0, 0]);

    const gain = inferLordFavor(makeGame([
      { t: 'negate', player: 3, sub: 'wuzhong', targetId: 0, chain: 1 },
      { t: 'negate', player: 2, sub: 'taoyuan', targetId: 1, chain: 1 }, // 不指向主公
    ]));
    expect(gain).toEqual([0, 0, 0, 1.5]);
  });
});

describe('stanceOf 与阈值', () => {
  it('THRESHOLD 为 2；favor 达阈值落三态', () => {
    expect(THRESHOLD).toBe(2);
    expect(stanceOf('fan', 2, 1, 0)).toBe('foe');
    expect(stanceOf('fan', 1.5, 1, 0)).toBe('unknown');
    expect(stanceOf('zhong', -2, 1, 0)).toBe('ally');
    expect(stanceOf('zhong', 0, 1, 0)).toBe('unknown');
  });

  it('主公本人按观看者身份直接判定；SIDE_OF 主忠同侧', () => {
    expect(stanceOf('fan', 0, 0, 0)).toBe('foe');
    expect(stanceOf('zhong', 0, 0, 0)).toBe('ally');
    expect(stanceOf('nei', 0, 0, 0)).toBe('ally'); // 非反贼视角主公皆"友"（先护主）
    expect(SIDE_OF.zhu).toBe('zhu');
    expect(SIDE_OF.zhong).toBe('zhu');
    expect(SIDE_OF.fan).toBe('fan');
    expect(SIDE_OF.nei).toBe('nei');
  });
});
