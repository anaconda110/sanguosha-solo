// viewOf(s, viewerId) 视角隔离。依据 src/engine/view.ts 通读确认的真实行为：
//   - 他人手牌完全不暴露：PublicPlayer 只有 handCount，没有 hand 字段（view.ts:48-69）
//   - 身份可见性：自己 / 主公 / 已死亡者可见，其余 null（view.ts:67-68）
//   - me：存活 viewer 才有（id + identity + 手牌浅拷贝），死亡或 null viewer → null（view.ts:80-83）
//   - fanjian 询问脱敏：pending.fanjian.cardId 一律 -1（对所有 viewer，含发起者），sourceId 保留；
//     引擎自持原值（view.ts:42-46）；其余 pending 原样透传
//   - hp 钳到 ≥0（view.ts:53）；判定区按 asSub 呈现生效牌名；装备区为公开信息
import { describe, expect, it } from 'vitest';
import { setup } from '../src/engine/setup';
import { viewOf } from '../src/engine/view';
import type { GameState, Inquiry, PlayerState } from '../src/engine/types';
import { makeCard, makePlayer } from './helpers';

function makeState(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 1, deck: [], discard: [], players, turnIdx: 0, turnCount: 0,
    phase: 'play', playedSha: false, turnPlays: 0, judging: false, skipDraw: false,
    skipPlay: false, damageBonus: 0, shaUsed: false, drawPhaseAsked: false,
    prepared: true, usedSkills: [], frames: [], frameSeq: 0, triggerQueue: [],
    judgeState: null, pending: null, log: [], actionLog: [], winner: null,
    ...overrides,
  };
}

describe('viewOf 视角隔离', () => {
  it('自己视角：me 携带身份与手牌拷贝，改 view 不影响引擎状态', () => {
    const s = setup(42);
    const v = viewOf(s, 0);
    expect(v.me).not.toBeNull();
    expect(v.me!.id).toBe(0);
    expect(v.me!.identity).toBe('zhu');
    expect(v.me!.hand).toEqual(s.players[0]!.hand);
    const n = s.players[0]!.hand.length;
    v.me!.hand.pop();
    expect(v.me!.hand).toHaveLength(n - 1);
    expect(s.players[0]!.hand).toHaveLength(n);
  });

  it('他人手牌不可见：只有 handCount，没有 hand 字段；牌堆/弃牌堆只有数量', () => {
    const s = setup(42);
    const v = viewOf(s, 0);
    v.players.forEach((pv, i) => {
      expect('hand' in pv).toBe(false);
      expect(pv.handCount).toBe(s.players[i]!.hand.length);
    });
    expect(v.deckCount).toBe(s.deck.length);
    expect(v.discardCount).toBe(s.discard.length);
    expect(v.log).toEqual(s.log);
  });

  it('身份可见性：自己 / 主公 / 死亡者可见，其余为 null（对所有 viewer 一致）', () => {
    const s = setup(42);
    const viewers: Array<number | null> = [null, 0, 1, 2, 3, 4];
    for (const viewerId of viewers) {
      const v = viewOf(s, viewerId);
      v.players.forEach((pv, i) => {
        const p = s.players[i]!;
        const visible = p.id === viewerId || p.identity === 'zhu' || !p.alive;
        expect(pv.identity).toBe(visible ? p.identity : null);
      });
    }
    // 具体化：0 号是主公 → 身份对所有人可见；1-4 号存活非主公 → 观战者看不到
    const vNull = viewOf(s, null);
    expect(vNull.players[0]!.identity).toBe('zhu');
    expect(vNull.players[0]!.isZhu).toBe(true);
    for (let i = 1; i < 5; i++) expect(vNull.players[i]!.identity).toBeNull();
    // 2 号看自己，但看不到其他存活者
    const v2 = viewOf(s, 2);
    expect(v2.players[2]!.identity).toBe(s.players[2]!.identity);
    expect(v2.players[1]!.identity).toBeNull();
    expect(v2.players[3]!.identity).toBeNull();
  });

  it('死亡玩家视角：me 为 null，但死亡者身份公开、hp 钳到 0', () => {
    const s = setup(42);
    const dead = s.players[3]!;
    dead.alive = false;
    dead.hp = -2;
    const v = viewOf(s, 3);
    expect(v.me).toBeNull();
    expect(v.players[3]!.alive).toBe(false);
    expect(v.players[3]!.identity).toBe(dead.identity);
    expect(v.players[3]!.hp).toBe(0);
    // 存活的非主公对死者依旧隐藏
    expect(v.players[1]!.identity).toBeNull();
    // 其他 viewer 也能看到死者的身份
    expect(viewOf(s, 0).players[3]!.identity).toBe(dead.identity);
    expect(viewOf(s, null).players[3]!.identity).toBe(dead.identity);
  });

  it('viewer 为 null（观战）：me 为 null', () => {
    const s = setup(42);
    expect(viewOf(s, null).me).toBeNull();
  });

  it('fanjian 询问脱敏：cardId 一律 -1、sourceId 保留；对所有 viewer（含发起者）一致；引擎自持原值', () => {
    const s = makeState([makePlayer(0, 'baiban', 'zhu'), makePlayer(1, 'baiban', 'fan')]);
    s.pending = { kind: 'fanjian', playerId: 1, fanjian: { sourceId: 0, cardId: 9999 } };
    for (const viewerId of [null, 0, 1]) {
      const v = viewOf(s, viewerId);
      expect(v.pending?.kind).toBe('fanjian');
      expect(v.pending!.fanjian).toEqual({ sourceId: 0, cardId: -1 });
    }
    expect(s.pending.fanjian!.cardId).toBe(9999);
  });

  it('pending 透传：非 fanjian 询问原样透传（play / respondShan / guanxing）', () => {
    const s = makeState([makePlayer(0, 'baiban', 'zhu'), makePlayer(1, 'baiban', 'fan')]);
    const pends: Inquiry[] = [
      { kind: 'play', playerId: 0 },
      { kind: 'respondShan', playerId: 1, shaSourceId: 0, shaCardId: 5, needShan: 2, shanPlayed: 1, frameId: 3 },
      { kind: 'guanxing', playerId: 0, guanxingCards: [makeCard('sha', '♠', 1), makeCard('tao', '♥', 2)] },
    ];
    for (const pend of pends) {
      s.pending = pend;
      expect(viewOf(s, 1).pending).toEqual(pend);
      expect(viewOf(s, null).pending).toEqual(pend);
    }
  });

  it('判定区按 asSub 呈现生效牌名；装备区公开，equips 与 equipSlots 一致', () => {
    const p0 = makePlayer(0, 'baiban', 'zhu');
    p0.judgements.push({ ...makeCard('sha', '♠', 7), asSub: 'lebusi' });
    p0.equipment.weapon = makeCard('qinggang', '♠', 8);
    p0.equipment.jia1ma = makeCard('jia1ma', '♥', 9);
    const s = makeState([p0, makePlayer(1, 'baiban', 'fan')]);
    const v = viewOf(s, 1);
    expect(v.players[0]!.judgements).toEqual(['lebusi']);
    expect(v.players[0]!.equips).toEqual(['qinggang', 'jia1ma']);
    expect(v.players[0]!.equipSlots).toEqual({ weapon: 'qinggang', jia1ma: 'jia1ma' });
  });

  it('公开字段透传：phase / turnIdx / playedSha / skipDraw / skipPlay / winner', () => {
    const s = makeState([makePlayer(0, 'baiban', 'zhu'), makePlayer(1, 'baiban', 'fan')], {
      phase: 'discard', turnIdx: 1, playedSha: true, skipDraw: true, skipPlay: true,
      winner: { side: 'fan' },
    });
    const v = viewOf(s, null);
    expect(v.phase).toBe('discard');
    expect(v.turnIdx).toBe(1);
    expect(v.playedSha).toBe(true);
    expect(v.skipDraw).toBe(true);
    expect(v.skipPlay).toBe(true);
    expect(v.winner).toEqual({ side: 'fan' });
  });
});
