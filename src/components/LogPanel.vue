<script setup lang="ts">
// 战报面板（M22 自 App.vue 迁出）：事件日志 → 文案。纯展示，无内部状态。
// evText 所需的玩家名经 props.players 索引（与 view.players 同序，按 id 取）。
import { IDENTITY_NAMES, SKILL_INFO, type GameEvent } from '../engine/types';
import type { PublicPlayer } from '../engine/view';
import { disp, REASON_NAMES, SIDE_NAMES } from '../composables/labels';

const props = defineProps<{ events: GameEvent[]; players: PublicPlayer[] }>();

function evText(e: GameEvent): string {
  const players = props.players;
  const n = (id?: number) => (id == null ? '' : players[id]!.name);
  switch (e.t) {
    case 'turnStart':
      return `── ${n(e.player)} 的回合 ──`;
    case 'draw':
      return `${n(e.player)} 摸了 ${e.n} 张牌`;
    case 'playCard': {
      const ts = e.targets ?? (e.target != null ? [e.target] : []);
      return ts.length > 1
        ? `${n(e.player)} 对 ${ts.map(n).join('、')} 使用【${disp(e.card)}】`
        : e.target != null
          ? `${n(e.player)} 对 ${n(e.target)} 使用【${disp(e.card)}】`
          : `${n(e.player)} 使用【${disp(e.card)}】`;
    }
    case 'respond':
      return e.card
        ? `${n(e.player)} 打出【${disp(e.card)}】`
        : e.resp === 'shan'
          ? `${n(e.player)} 未出【闪】`
          : e.resp === 'sha'
            ? `${n(e.player)} 未打出【杀】`
            : e.resp === 'wuxie'
              ? `${n(e.player)} 不使用【无懈可击】`
              : `${n(e.player)} 不使用【桃】`;
    case 'damage':
      return `${n(e.player)} 受到 ${e.amount} 点伤害`;
    case 'heal':
      return `${n(e.player)} 回复 ${e.amount} 点体力`;
    case 'dying':
      return `⚠ ${n(e.player)} 濒死！`;
    case 'death':
      return `${n(e.player)} 阵亡，身份是【${IDENTITY_NAMES[e.identity]}】`;
    case 'rewardDraw':
      return `${n(e.player)} 摸三张牌（杀死反贼的奖惩）`;
    case 'penaltyDiscard':
      return `${n(e.player)} 弃置全部手牌（主公杀死忠臣的惩罚）`;
    case 'discardCards':
      return `${n(e.player)} 弃置 ${e.n} 张牌`;
    case 'wuguReveal':
      return `五谷丰登亮出【${disp(e.card.sub)}】${e.card.suit}${e.card.rank}`;
    case 'equip':
      return `${n(e.player)} 装备了【${disp(e.sub)}】`;
    case 'unequip':
      return `${n(e.player)} 的【${disp(e.sub)}】被弃置`;
    case 'gainCard':
      return `${n(e.player)} 获得了 ${n(e.from)} 的一张牌`;
    case 'negate': {
      // 无懈链（M11）：奇数张 = 抵消生效中；偶数张（≥2）= 被反无懈，恢复生效
      const what = e.targetId != null ? `【${disp(e.sub)}】对 ${n(e.targetId)} 的效果` : `【${disp(e.sub)}】`;
      if ((e.chain ?? 1) === 1) return `${n(e.player)} 用【无懈可击】抵消了${what}`;
      return (e.chain ?? 1) % 2 === 1
        ? `${n(e.player)} 用【无懈可击】再度抵消了${what}`
        : `${n(e.player)} 用【无懈可击】反制，${what}恢复`;
    }
    case 'judge':
      return `${n(e.player)} 的【${REASON_NAMES[e.reason]}】判定 → ${e.card.suit}${e.card.rank}【${disp(e.card.sub)}】`;
    case 'judgeModify':
      return `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】改判为 ${e.card.suit}${e.card.rank}【${disp(e.card.sub)}】`;
    case 'skill':
      return e.detail
        ? `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】（${e.detail}）`
        : `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】`;
    case 'ability':
      return e.detail
        ? `${n(e.player)} 发动【${disp(e.sub)}】（${e.detail}）`
        : `${n(e.player)} 发动【${disp(e.sub)}】`;
    case 'moveJudgement':
      return `【${disp(e.sub)}】移至 ${n(e.to)} 的判定区`;
    case 'gameOver':
      return `■■ ${SIDE_NAMES[e.side]} 获胜 ■■`;
  }
}
</script>

<template>
  <section class="log">
    <div v-for="(e, i) in events.slice(-40)" :key="i" class="logev">{{ evText(e) }}</div>
  </section>
</template>

<style>
.log {
  background: #1b1f27;
  border: 1px solid #2c313c;
  border-radius: 8px;
  padding: 8px 12px;
  max-height: 180px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: #9aa3b2;
}
</style>
