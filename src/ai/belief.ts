// 身份推断（ADR-0003 承诺的"行为打分"，M12）：只读公开日志，为每名玩家累计
// "对主公的立场分"。纯函数、只看公开事件——同一局面任何时刻推断结果一致，
// 可复现性与 MC 确定性不受影响。
//
// 约定：favor[X] > 0 = X 疑似反贼/内奸（敌对主公）；< 0 = X 疑似忠臣（维护主公）；
// 绝对值小于阈值 = 未知（此时退回原有"全员皆敌"的保守策略）。
import type { GameState, Identity } from '../engine/types';

/** 可指向单一目标的进攻性牌（群体锦囊不加权：人人都用，不构成身份证据） */
const HOSTILE: Record<string, true> = {
  sha: true, guohe: true, shunshou: true, juedou: true, lebusi: true, bingliang: true,
};

/** 判定为"敌"的阈值：约等于一次直接冒犯主公 */
export const THRESHOLD = 2;

export type Stance = 'foe' | 'ally' | 'unknown';

/** 身份 → 阵营（胜负归属）：主公与忠臣同侧 */
export const SIDE_OF: Record<Identity, 'zhu' | 'fan' | 'nei'> = {
  zhu: 'zhu',
  zhong: 'zhu',
  fan: 'fan',
  nei: 'nei',
};

/** 行为证据只看最近这么多条日志：更早的交互对当下判断影响很小，
 *  而 MC rollout 里每步都要推断一次（无窗口时 4 局 MC 自战从 17s 涨到 38s） */
const WINDOW = 600;

/**
 * 行为打分：扫描公开日志的最近 WINDOW 条，累计每名玩家对主公的立场分。
 * 只读 s.log（公开事件流）与公开的死亡身份——不使用任何隐藏状态，因此同一局面
 * 推断结果恒定，回放与 MC 的确定性不受影响（ADR-0002/0006）。
 * 信号（按可靠性排序，死亡结算的身份最可靠）：
 *   1. 击杀已亮明的反贼/内奸 → 站在主公一边（-2）；击杀忠臣 → 敌对主公（+2）
 *   2. 以单目标进攻牌指向主公（+2）
 *   3. 为濒死的主公出桃 / 青囊主公（-2）
 *   4. 无懈链第一张：抵消指向主公的进攻锦囊（-1.5）；抵消主公自己的增益锦囊（+1.5）
 */
export function inferLordFavor(s: GameState): number[] {
  const n = s.players.length;
  const favor = new Array<number>(n).fill(0);
  const zhu = s.players.find(p => p.identity === 'zhu');
  if (!zhu) return favor;
  const zhuId = zhu.id;

  let healer: number | null = null; // 最近一次"可归因的施救者"（出桃/青囊），供紧随的 heal 事件归因
  const from = Math.max(0, s.log.length - WINDOW);
  for (let i = from; i < s.log.length; i++) {
    const e = s.log[i]!;
    switch (e.t) {
      case 'playCard': {
        if (e.player === zhuId) break; // 主公自己的动作不是身份证据
        const targets = e.targets ?? (e.target != null ? [e.target] : []);
        if (targets.length !== 1) break; // 群体锦囊不判
        if (targets[0] === zhuId && HOSTILE[e.card] === true) favor[e.player] += 2;
        break;
      }
      case 'death': {
        // 死亡结算公开身份，凶手的行为因此可归因（主公杀忠臣是自己的惩罚规则，不计）
        if (e.killer == null || e.killer === zhuId) break;
        if (e.identity === 'fan' || e.identity === 'nei') favor[e.killer] -= 2;
        else if (e.identity === 'zhong') favor[e.killer] += 2;
        break;
      }
      case 'respond':
        if (e.resp === 'tao') healer = e.player;
        break;
      case 'skill':
        if (e.sub === 'qingnang') healer = e.player;
        break;
      case 'heal': {
        // 归因：紧跟施救者之后出现的 heal，其目标即被救者
        if (healer != null && healer !== e.player && e.player === zhuId) favor[healer] -= 2;
        healer = null;
        break;
      }
      case 'negate': {
        if (e.targetId !== zhuId) break;
        if ((e.chain ?? 1) !== 1) break; // 只看链上第一张，反无懈归因留待后续
        const sub = String(e.sub);
        if (HOSTILE[sub] === true || sub === 'shandian') favor[e.player] -= 1.5;
        else if (sub === 'wuzhong' || sub === 'taoyuan') favor[e.player] += 1.5;
        break;
      }
    }
  }
  return favor;
}

/** 把立场分落成三态；主公本人按视角身份直接判定 */
export function stanceOf(
  viewerIdentity: Identity,
  favor: number,
  playerId: number,
  zhuId: number,
): Stance {
  if (playerId === zhuId) return viewerIdentity === 'fan' ? 'foe' : 'ally';
  if (favor >= THRESHOLD) return 'foe';
  if (favor <= -THRESHOLD) return 'ally';
  return 'unknown';
}
