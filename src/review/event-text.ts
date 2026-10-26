// 事件 → 中文文案的唯一纯函数实现，供战报面板与复盘 Markdown 共用。
import { IDENTITY_NAMES, SKILL_INFO, type GameEvent } from '../engine/types';
import { disp, REASON_NAMES, SIDE_NAMES } from '../composables/labels';

export interface NamedEventPlayer {
  id: number;
  name: string;
}

export function describeGameEvent(event: GameEvent, players: readonly NamedEventPlayer[]): string {
  const name = (id?: number) => (id == null ? '' : (players[id]?.name ?? `玩家${id}`));
  switch (event.t) {
    case 'turnStart':
      return `── ${name(event.player)} 的回合 ──`;
    case 'draw':
      return `${name(event.player)} 摸了 ${event.n} 张牌`;
    case 'playCard': {
      const targets = event.targets ?? (event.target != null ? [event.target] : []);
      return targets.length > 1
        ? `${name(event.player)} 对 ${targets.map(name).join('、')} 使用【${disp(event.card)}】`
        : event.target != null
          ? `${name(event.player)} 对 ${name(event.target)} 使用【${disp(event.card)}】`
          : `${name(event.player)} 使用【${disp(event.card)}】`;
    }
    case 'respond':
      return event.card
        ? `${name(event.player)} 打出【${disp(event.card)}】`
        : event.resp === 'shan'
          ? `${name(event.player)} 未出【闪】`
          : event.resp === 'sha'
            ? `${name(event.player)} 未打出【杀】`
            : event.resp === 'wuxie'
              ? `${name(event.player)} 不使用【无懈可击】`
              : `${name(event.player)} 不使用【桃】`;
    case 'damage':
      return `${name(event.player)} 受到 ${event.amount} 点${event.loss ? '体力损失' : '伤害'}`;
    case 'heal':
      return `${name(event.player)} 回复 ${event.amount} 点体力`;
    case 'dying':
      return `⚠ ${name(event.player)} 濒死！`;
    case 'death':
      return `${name(event.player)} 阵亡，身份是【${IDENTITY_NAMES[event.identity]}】`;
    case 'rewardDraw':
      return `${name(event.player)} 摸三张牌（杀死反贼的奖惩）`;
    case 'penaltyDiscard':
      return `${name(event.player)} 弃置全部手牌（主公杀死忠臣的惩罚）`;
    case 'discardCards':
      return `${name(event.player)} 弃置 ${event.n} 张牌`;
    case 'wuguReveal':
      return `五谷丰登亮出【${disp(event.card.sub)}】${event.card.suit}${event.card.rank}`;
    case 'equip':
      return `${name(event.player)} 装备了【${disp(event.sub)}】`;
    case 'unequip':
      return `${name(event.player)} 的【${disp(event.sub)}】被弃置`;
    case 'gainCard':
      return `${name(event.player)} 获得了 ${name(event.from)} 的一张牌`;
    case 'negate': {
      const what = event.targetId != null
        ? `【${disp(event.sub)}】对 ${name(event.targetId)} 的效果`
        : `【${disp(event.sub)}】`;
      if ((event.chain ?? 1) === 1) return `${name(event.player)} 用【无懈可击】抵消了${what}`;
      return (event.chain ?? 1) % 2 === 1
        ? `${name(event.player)} 用【无懈可击】再度抵消了${what}`
        : `${name(event.player)} 用【无懈可击】反制，${what}恢复`;
    }
    case 'judge':
      return `${name(event.player)} 的【${REASON_NAMES[event.reason]}】判定 → ${event.card.suit}${event.card.rank}【${disp(event.card.sub)}】`;
    case 'judgeModify':
      return `${name(event.player)} 发动【${SKILL_INFO[event.sub].display}】改判为 ${event.card.suit}${event.card.rank}【${disp(event.card.sub)}】`;
    case 'skill':
      return event.detail
        ? `${name(event.player)} 发动【${SKILL_INFO[event.sub].display}】（${event.detail}）`
        : `${name(event.player)} 发动【${SKILL_INFO[event.sub].display}】`;
    case 'ability':
      return event.detail
        ? `${name(event.player)} 发动【${disp(event.sub)}】（${event.detail}）`
        : `${name(event.player)} 发动【${disp(event.sub)}】`;
    case 'moveJudgement':
      return `【${disp(event.sub)}】移至 ${name(event.to)} 的判定区`;
    case 'gameOver':
      return `■■ ${SIDE_NAMES[event.side]} 获胜 ■■`;
  }
}
