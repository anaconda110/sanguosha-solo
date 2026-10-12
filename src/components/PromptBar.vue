<script setup lang="ts">
// 提示栏（M22 自 App.vue 迁出）：底部询问/出牌会话的按钮区 + DEBUG 行 + 观战提示。
// 状态来源：game（view/pend/技能素材判定）与 interact（选牌会话态）；act 直接经
// useGame.act 提交——与原实现同一调用路径，act 内部的会话清空由 game→interaction 回调完成。
import { computed } from 'vue';
import { GENERAL_INFO, SKILL_INFO, type EquipSlot, type Suit } from '../engine/types';
import type { GameApi, InteractionApi, SettingsApi } from '../composables/types';
import { disp, SUIT_LIST } from '../composables/labels';

const props = defineProps<{ game: GameApi; interact: InteractionApi; ui: SettingsApi; thinking: boolean }>();
const {
  view, humanId, spectate, me, meP, myGeneral, mySkills, pend, getState, act,
  altShaMaterial, shaMaterialNow, hasCardInHand, jijiuMaterial, lijianReady,
} = props.game;
const {
  selected, selected2, fangtianTargets, jiedaoVictim, guanshiSel, guanxingPick,
  activeMode, activeSel, liuliPick, tuxiSel, discardSel, lijianMode, lijianCard, lijianTargets,
  discardCount, canConfirmDiscard, resetLijian, cancelSel, toggleLijian, onGuanxingClick, confirmFangtian,
} = props.interact;
const { showDebug } = props.ui;

/** 观战模式下的提示文字（当前轮到谁、在等什么） */
const spectateHint = computed(() => {
  const p = view.value.pending;
  if (!p) return '';
  const KIND: Record<string, string> = {
    play: '出牌', respondShan: '要【闪】', respondSha: '要【杀】', respondTao: '濒死求桃',
    respondWuxie: '无懈询问', pickCard: '选牌', trigger: '发动技能', skillCard: '鬼才改判',
    discard: '弃牌', cixiong: '雌雄选择', guanshi: '贯石斧', guanxing: '观星', liuli: '流离',
    fanjian: '反间', wuguPick: '五谷取牌', jiedao: '借刀应答', lordSkill: '主公求援', shaAgain: '青龙再杀',
  };
  return `${waitingName.value} 正在${KIND[p.kind] ?? '行动'}…`;
});
const waitingName = computed(() => {
  const p = view.value.pending;
  return p ? view.value.players[p.playerId]!.name : '';
});
/** 无懈链（M11）：当前询问所属的帧，供 UI 显示"已被抵消 / 已恢复生效" */
const wuxieFrame = computed(() => {
  const p = pend.value;
  if (p?.kind !== 'respondWuxie' || p.frameId == null) return null;
  return getState().frames.find(f => f.id === p.frameId) ?? null;
});

/** 通用主动技的提示文案 */
const activeModePrompt = computed(() => {
  const n = activeSel.value.length;
  switch (activeMode.value) {
    case 'zhiheng':
      return `点手牌选择要弃置的牌（已选 ${n} 张）`;
    case 'rende':
      return `点手牌选择要给出的牌（已选 ${n} 张）——再点一名其他角色赠予`;
    case 'qingnang':
      return n === 0 ? '点一张手牌作为代价' : '再点一名已受伤的角色';
    case 'fanjian':
      return n === 0 ? '点一张手牌作为展示牌' : '再点一名其他角色，令其猜花色';
    case 'jieyin':
      return n < 2 ? `点手牌选择要弃置的两张（已选 ${n} 张）` : '再点一名已受伤的男性角色';
    default:
      return '';
  }
});

/** 出【闪】按钮：真闪/龙胆（赵云）/倾国（甄姬黑牌）任一素材可用 */
const shanRespondable = computed(() => {
  const g = myGeneral.value;
  const hand = me.value?.hand ?? [];
  if (hand.some(c => c.sub === 'shan')) return true;
  if (g === 'zhaoyun') return hand.some(c => c.sub === 'sha');
  if (g === 'zhenji') return hand.some(c => !props.game.isRedCard(c));
  return false;
});
const shanButtonLabel = computed(() => {
  const g = myGeneral.value;
  const hand = me.value?.hand ?? [];
  const hasShan = hand.some(c => c.sub === 'shan');
  if (!hasShan && g === 'zhaoyun' && hand.some(c => c.sub === 'sha')) return '用【杀】代替（龙胆）';
  if (!hasShan && g === 'zhenji') return '用黑色手牌代替（倾国）';
  return '出【闪】';
});

function respondShan(use: boolean) {
  if (!use) {
    act({ type: 'respondShan', cardId: null });
    return;
  }
  // 优先出真【闪】；龙胆无闪可用【杀】；倾国无闪可用黑色手牌（桃必为红色，不会被误出）
  const hand = me.value?.hand ?? [];
  const card =
    hand.find(c => c.sub === 'shan') ??
    (myGeneral.value === 'zhaoyun' ? hand.find(c => c.sub === 'sha') : undefined) ??
    (myGeneral.value === 'zhenji' ? hand.find(c => !props.game.isRedCard(c)) : undefined);
  act({ type: 'respondShan', cardId: card ? card.id : null });
}

function respondSha(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'sha') : undefined;
  act({ type: 'respondSha', cardId: card ? card.id : null });
}

function respondShaAlt() {
  const card = altShaMaterial();
  if (card) act({ type: 'respondSha', cardId: card.id });
}

function respondWuxie(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'wuxie') : undefined;
  act({ type: 'respondWuxie', cardId: card ? card.id : null });
}

function respondTao(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'tao') : undefined;
  act({ type: 'respondTao', cardId: card ? card.id : null });
}

function respondTaoAlt() {
  const card = jijiuMaterial();
  act({ type: 'respondTao', cardId: card ? card.id : null });
}

/** 反间应答（周瑜的对手）：猜一种花色 */
function respondFanjian(suit: Suit) {
  act({ type: 'respondFanjian', suit });
}

/** 主公技代打（护驾/激将，M14）：盟友应答——出闪/出杀，或不应 */
function respondAid(use: boolean) {
  const p = pend.value;
  if (!p || p.lordPend?.aidForId == null) return;
  if (!use) {
    if (p.sub === 'hujia') act({ type: 'respondShan', cardId: null });
    else act({ type: 'respondSha', cardId: null });
    return;
  }
  const hand = me.value?.hand ?? [];
  if (p.sub === 'hujia') {
    const card =
      hand.find(c => c.sub === 'shan') ??
      (myGeneral.value === 'zhaoyun' ? hand.find(c => c.sub === 'sha') : undefined) ??
      (myGeneral.value === 'zhenji' ? hand.find(c => !props.game.isRedCard(c)) : undefined);
    act({ type: 'respondShan', cardId: card ? card.id : null });
  } else {
    const card = hand.find(c => c.sub === 'sha') ?? altShaMaterial();
    act({ type: 'respondSha', cardId: card ? card.id : null });
  }
}

/** 选牌（拆/顺）：pickTarget 为被选牌玩家，pickOpts 为可选项（ADR-0008） */
const pickTarget = computed(() => {
  const p = pend.value;
  return p?.kind === 'pickCard' && p.trickTargetId != null
    ? view.value.players.find(x => x.id === p.trickTargetId)
    : undefined;
});
const pickOpts = computed(() => {
  const t = pickTarget.value;
  if (!t || !t.alive) return [] as Array<{ from: EquipSlot | 'hand'; label: string }>;
  const slots = t.equipSlots;
  const out: Array<{ from: EquipSlot | 'hand'; label: string }> = [];
  if (slots.weapon) out.push({ from: 'weapon', label: disp(slots.weapon) });
  if (slots.shield) out.push({ from: 'shield', label: disp(slots.shield) });
  if (slots.jian1ma) out.push({ from: 'jian1ma', label: disp(slots.jian1ma) });
  if (slots.jia1ma) out.push({ from: 'jia1ma', label: disp(slots.jia1ma) });
  if (t.handCount > 0) out.push({ from: 'hand', label: `手牌（暗）×${t.handCount}，随机抽一张` });
  return out;
});

function pickCard(from: EquipSlot | 'hand') {
  act({ type: 'pickCard', from });
}

function shaAgain(use: boolean) {
  const card = use ? shaMaterialNow() : undefined;
  act({ type: 'shaAgain', cardId: card ? card.id : null });
}
</script>

<template>
  <section class="prompt">
    <div v-if="showDebug" style="font-size:11px;color:#e05555">
      DEBUG humanId={{ humanId }} spectate={{ spectate }} pend={{ pend ? pend.kind + '@' + pend.playerId : 'null' }}
      viewPending={{ view.pending ? view.pending.kind + '@' + view.pending.playerId : 'null' }}
      meAlive={{ !!view.me }} winner={{ !!view.winner }}
      <button class="btn ghost" @click="showDebug = false">关</button>
    </div>
    <template v-if="view.winner">对局结束——可用下方回放逐步检视整局。</template>
    <template v-else-if="spectate">观战中 —— {{ spectateHint }}</template>
    <template v-else-if="pend?.kind === 'play'">
      <template v-if="activeMode">
        【{{ SKILL_INFO[activeMode].display }}】{{ activeModePrompt }}
        <button
          v-if="activeMode === 'zhiheng' && activeSel.length > 0"
          class="btn"
          @click="act({ type: 'useSkill', sub: 'zhiheng', cardIds: [...activeSel] })"
        >确认制衡</button>
        <button class="btn ghost" @click="activeMode = null; activeSel = []">取消</button>
      </template>
      <template v-else-if="lijianMode">
        【离间】{{ !lijianCard ? '点一张手牌弃置' : `已选【${disp(lijianCard.sub)}】——点两名男性角色（先选决斗使用者）` }}（已选 {{ lijianTargets.length }}/2）
        <button class="btn ghost" @click="resetLijian">取消</button>
      </template>
      <template v-else-if="selected && fangtianTargets.length > 0">
        【方天画戟】已选 {{ fangtianTargets.length }} 个目标——
        <button class="btn" @click="confirmFangtian">使用【杀】</button>
        <button class="btn ghost" @click="fangtianTargets = []">重选目标</button>
        <button class="btn ghost" @click="cancelSel">取消</button>
      </template>
      <template v-else-if="selected && selected2">
        已选两张当【杀】（丈八蛇矛）——点目标玩家使用
        <button class="btn ghost" @click="cancelSel">取消</button>
      </template>
      <template v-else-if="selected">
        <template v-if="selected.sub === 'jiedao'">
          【借刀杀人】{{ jiedaoVictim == null ? '点一名装备了武器的角色' : `${view.players[jiedaoVictim]!.name} 需出杀——点他要打的目标` }}
        </template>
        <template v-else>已选【{{ disp(selected.sub) }}】——点目标玩家使用</template>
        <button class="btn ghost" @click="cancelSel">取消</button>
      </template>
      <template v-else>
        出牌阶段（{{ GENERAL_INFO[myGeneral].skill || '白板' }}）：点牌使用；杀/锦囊需再点目标
        <button
          v-if="mySkills.includes('kurou') && !getState().usedSkills.includes('kurou') && (meP?.hp ?? 0) > 1"
          class="btn"
          @click="act({ type: 'useSkill', sub: 'kurou' })"
        >
          苦肉（-1体力 摸2张）
        </button>
        <button v-if="lijianReady && !lijianMode" class="btn" @click="toggleLijian">
          离间（弃1牌 两名男性决斗）
        </button>
        <button
          v-if="mySkills.includes('zhiheng') && !getState().usedSkills.includes('zhiheng') && (me?.hand.length ?? 0) >= 1"
          class="btn"
          @click="activeMode = 'zhiheng'; activeSel = []"
        >
          制衡（弃任意张 摸等量）
        </button>
        <button
          v-if="mySkills.includes('rende') && !getState().usedSkills.includes('rende') && (me?.hand.length ?? 0) >= 1"
          class="btn"
          @click="activeMode = 'rende'; activeSel = []"
        >
          仁德（给牌 2张回1血）
        </button>
        <button
          v-if="mySkills.includes('qingnang') && !getState().usedSkills.includes('qingnang') && (me?.hand.length ?? 0) >= 1"
          class="btn"
          @click="activeMode = 'qingnang'; activeSel = []"
        >
          青囊（弃1牌 目标回1血）
        </button>
        <button
          v-if="mySkills.includes('fanjian') && !getState().usedSkills.includes('fanjian') && (me?.hand.length ?? 0) >= 1"
          class="btn"
          @click="activeMode = 'fanjian'; activeSel = []"
        >
          反间（展示1牌 猜错花色受伤）
        </button>
        <button
          v-if="mySkills.includes('jieyin') && !getState().usedSkills.includes('jieyin') && (me?.hand.length ?? 0) >= 2"
          class="btn"
          @click="activeMode = 'jieyin'; activeSel = []"
        >
          结姻（弃2牌 与受伤男性各回1血）
        </button>
        <button class="btn" @click="act({ type: 'endPlay' })">结束出牌</button>
      </template>
    </template>
    <template v-else-if="pend?.kind === 'respondShan'">
      {{ pend.trickSub === 'wanjian' ? '【万箭齐发】——需打出【闪】，否则受到 1 点伤害' : '你成为【杀】的目标 ——' }}
      <button
        class="btn"
        :disabled="!shanRespondable"
        @click="respondShan(true)"
      >
        {{ shanButtonLabel }}
      </button>
      <button
        v-if="meP?.equips.includes('bagua') && !pend.baguaTried && !pend.qinggang"
        class="btn"
        @click="act({ type: 'respondBagua' })"
      >
        八卦判定
      </button>
      <button class="btn" @click="respondShan(false)">不出</button>
    </template>
    <template v-else-if="pend?.kind === 'cixiong' && pend.cixiong">
      【雌雄双股剑】—— {{ view.players[pend.cixiong.sourceId]!.name }} 对你使用【杀】：
      <button class="btn" @click="act({ type: 'respondCixiong', discard: true })">弃一张手牌（杀无效）</button>
      <button class="btn" @click="act({ type: 'respondCixiong', discard: false })">让他摸一张牌</button>
    </template>
    <template v-else-if="pend?.kind === 'guanshi'">
      【贯石斧】——【杀】被闪避，弃两张手牌强行命中？（已选 {{ guanshiSel.length }}/2）
      <button class="btn" :disabled="guanshiSel.length !== 2" @click="act({ type: 'respondGuanshi', cardIds: [...guanshiSel] })">
        强行命中
      </button>
      <button class="btn" @click="act({ type: 'respondGuanshi', cardIds: null })">不发动</button>
    </template>
    <template v-else-if="pend?.kind === 'respondSha'">
      {{ pend.trickSub === 'juedou' ? '【决斗】——轮到你打出【杀】' : '【南蛮入侵】——需打出【杀】，否则受到 1 点伤害' }}
      <button class="btn" :disabled="!hasCardInHand('sha')" @click="respondSha(true)">打出【杀】</button>
      <button v-if="altShaMaterial()" class="btn" @click="respondShaAlt()">
        用【{{ disp(altShaMaterial()!.sub) }}】代替（{{ myGeneral === 'guanyu' ? '武圣' : '龙胆' }}）
      </button>
      <button class="btn" @click="respondSha(false)">不打出</button>
    </template>
    <template v-else-if="pend?.kind === 'shaAgain'">
      【青龙偃月刀】——【杀】被【闪】避掉，可对 {{ view.players[view.pending!.targetId!]!.name }} 再使用一张【杀】
      <button class="btn" :disabled="!shaMaterialNow()" @click="shaAgain(true)">再杀</button>
      <button class="btn" @click="shaAgain(false)">不杀</button>
    </template>
    <template v-else-if="pend?.kind === 'respondWuxie'">
      【{{ pend.trickSub ? disp(pend.trickSub) : '' }}】{{ pend.trickTargetId != null ? '对 ' + view.players[pend.trickTargetId]!.name + ' ' : '' }}结算
      <span v-if="wuxieFrame && wuxieFrame.kind !== 'sha' && wuxieFrame.wuxieCount > 0" class="wuxie-chain">
        （已被 {{ wuxieFrame.wuxieCount }} 张【无懈可击】{{ wuxieFrame.wuxieCount % 2 === 1 ? '抵消' : '反制恢复' }}）
      </span>
      ——
      <button class="btn" :disabled="!hasCardInHand('wuxie')" @click="respondWuxie(true)">
        {{ wuxieFrame && wuxieFrame.kind !== 'sha' && wuxieFrame.wuxieCount % 2 === 1 ? '用【无懈可击】反制（恢复生效）' : '用【无懈可击】抵消' }}
      </button>
      <button class="btn" @click="respondWuxie(false)">不抵消</button>
    </template>
    <template v-else-if="pend?.kind === 'fanjian'">
      【反间】—— {{ view.players[pend.fanjian!.sourceId]!.name }} 令你猜一种花色，猜错将受到 1 点伤害：
      <button v-for="s in SUIT_LIST" :key="s" class="btn" @click="respondFanjian(s)">{{ s }}</button>
    </template>
    <template v-else-if="pend?.kind === 'wuguPick'">
      【五谷丰登】—— 亮出的牌（公开）：请选一张
      <button
        v-for="c in pend.wuguCards ?? []"
        :key="c.id"
        class="btn"
        @click="act({ type: 'respondWugu', cardId: c.id })"
      >{{ disp(c.sub) }} {{ c.suit }}{{ c.rank }}</button>
    </template>
    <template v-else-if="pend?.kind === 'jiedao'">
      【借刀杀人】—— {{ view.players[pend.jiedao!.user]!.name }} 令你对
      {{ view.players[pend.targetId!]!.name }} 使用【杀】，否则你的【{{ disp(pend.jiedao!.weaponSub) }}】将交给他：
      <button class="btn" :disabled="!shaMaterialNow()" @click="act({ type: 'respondJiedao', cardId: shaMaterialNow()!.id })">
        使用【杀】
      </button>
      <button class="btn" @click="act({ type: 'respondJiedao', cardId: null })">交出武器</button>
    </template>
    <template v-else-if="pend?.kind === 'drawPhase'">
      摸牌阶段 —— {{ SKILL_INFO[mySkills.includes('tuxi') ? 'tuxi' : 'luoyi'].display }} 可选：
      <button v-if="mySkills.includes('tuxi')" class="btn" @click="act({ type: 'respondDraw', skill: 'tuxi' })">
        突袭（不摸牌，夺至多两人各一张手牌）
      </button>
      <button v-if="mySkills.includes('luoyi')" class="btn" @click="act({ type: 'respondDraw', skill: 'luoyi' })">
        裸衣（少摸1张，本回合杀/决斗伤害+1）
      </button>
      <button class="btn ghost" @click="act({ type: 'respondDraw' })">正常摸牌</button>
    </template>
    <template v-else-if="pend?.kind === 'tuxi'">
      【突袭】——点选至多两名目标（他们各被你拿走一张手牌），集齐或点"确定"：
      （已选 {{ tuxiSel.length }}/2）
      <button class="btn" @click="act({ type: 'respondTuxi', targetIds: [...tuxiSel] })">确定</button>
    </template>
    <template v-else-if="pend?.kind === 'yiji' && pend.yijiPool?.length">
      【遗计】——把这张牌交给谁？（{{ disp(pend.yijiPool[0]!.sub) }}{{ pend.yijiPool[0]!.suit }}{{ pend.yijiPool[0]!.rank }}，剩 {{ pend.yijiPool.length }} 张）
      <button
        v-for="p in view.players.filter(x => x.alive)"
        :key="p.id"
        class="btn"
        @click="act({ type: 'respondYiji', cardId: pend.yijiPool![0]!.id, toId: p.id })"
      >{{ p.id === humanId ? '自己留着' : p.name }}</button>
    </template>
    <template v-else-if="pend?.kind === 'lordSkill'">
      <template v-if="pend.lordPend?.aidForId != null">
        【{{ SKILL_INFO[pend.sub!].display }}】—— {{ view.players[pend.lordPend.aidForId]!.name }} 请求你
        {{ pend.sub === 'hujia' ? '打出一张【闪】' : '打出一张【杀】' }}
        （效果归于他）：
        <button
          class="btn"
          :disabled="pend.sub === 'hujia' ? !shanRespondable : !hasCardInHand('sha')"
          @click="respondAid(true)"
        >
          {{ pend.sub === 'hujia' ? shanButtonLabel : '打出【杀】' }}
        </button>
        <button class="btn" @click="respondAid(false)">不应</button>
      </template>
      <template v-else>
        【{{ SKILL_INFO[pend.sub!].display }}】—— 需要
        {{ pend.sub === 'hujia' ? '一张【闪】' : '一张【杀】' }}，可向同势力盟友求援：
        <button class="btn" @click="act({ type: 'respondLord', use: true })">求援</button>
        <button class="btn" @click="act({ type: 'respondLord', use: false })">自己处理</button>
      </template>
    </template>
    <template v-else-if="pend?.kind === 'respondTao'">
      {{ view.players[view.pending!.dyingId!]!.name }} 濒死 ——
      <button class="btn" :disabled="!hasCardInHand('tao')" @click="respondTao(true)">用【桃】</button>
      <button
        v-if="mySkills.includes('jijiu') && !hasCardInHand('tao') && jijiuMaterial()"
        class="btn"
        @click="respondTaoAlt()"
      >
        用【{{ disp(jijiuMaterial()!.sub) }}】代替（急救）
      </button>
      <button class="btn" @click="respondTao(false)">不用</button>
    </template>
    <template v-else-if="pend?.kind === 'pickCard'">
      <template v-if="pend.skillPick">
        【{{ SKILL_INFO[pend.skillPick.sub].display }}】——选择要拿走的牌：
      </template>
      <template v-else>
        【{{ pend.trickSub ? disp(pend.trickSub) : '' }}】——选择要{{ pend.trickSub === 'guohe' ? '弃置' : '获得' }}的牌：
      </template>
      <button
        v-for="o in pickOpts"
        :key="o.from"
        class="btn"
        @click="pickCard(o.from)"
      >
        {{ o.label }}
      </button>
    </template>
    <template v-else-if="pend?.kind === 'trigger' && pend.sub">
      <span class="skill-trigger">【{{ SKILL_INFO[pend.sub].display }}】{{ SKILL_INFO[pend.sub].desc }} ——</span>
      <button class="btn" @click="act({ type: 'respondTrigger', use: true })">发动</button>
      <button class="btn" @click="act({ type: 'respondTrigger', use: false })">不发动</button>
    </template>
    <template v-else-if="pend?.kind === 'skillCard' && pend.sub">
      <span class="skill-trigger">【{{ SKILL_INFO[pend.sub].display }}】—— 点一张手牌替换判定牌</span>
      <button class="btn" @click="act({ type: 'respondSkillCard', cardId: null })">不替换</button>
    </template>
    <template v-else-if="pend?.kind === 'guanxing'">
      【观星】—— 点牌置于牌堆顶（先点的先摸到），未点的置牌堆底（已选 {{ guanxingPick.length }}/{{ pend.guanxingCards?.length ?? 0 }}）
      <button class="btn" @click="act({ type: 'respondGuanxing', topIds: [...guanxingPick] })">确认观星</button>
      <div class="guanxing-row">
        <div
          v-for="(c, gi) in pend.guanxingCards ?? []"
          :key="c.id"
          class="card gx-chip"
          :class="{ selected: guanxingPick.includes(c.id) }"
          @click="onGuanxingClick(c)"
        >
          <div class="cname">{{ disp(c.sub) }}</div>
          <div class="csuit">{{ c.suit }}{{ c.rank }}</div>
          <div class="gx-order" v-if="guanxingPick.includes(c.id)">第{{ guanxingPick.indexOf(c.id) + 1 }}</div>
        </div>
      </div>
    </template>
    <template v-else-if="pend?.kind === 'liuli'">
      【流离】—— {{ !liuliPick ? '点一张手牌弃置，把【杀】转移给距离1以内的男性' : `已选【${disp(liuliPick.sub)}】——点要转移给的男性目标` }}
      <button class="btn" @click="act({ type: 'respondLiuli', cardId: null })">不发动</button>
    </template>
    <template v-else-if="pend?.kind === 'discard'">
      {{ pend.cixiong ? '【雌雄双股剑】——弃置一张手牌令【杀】无效' : `请弃置 ${discardCount} 张手牌` }}（已选 {{ discardSel.length }} 张）
      <button class="btn" :disabled="!canConfirmDiscard" @click="act({ type: 'discard', cardIds: [...discardSel] })">
        确认弃牌
      </button>
    </template>
    <template v-else-if="thinking"><span class="thinking">🤔 {{ waitingName }} 思考中…</span></template>
    <template v-else>等待 {{ waitingName }} 行动…</template>
  </section>
</template>

<style>
.prompt {
  background: #22262f;
  border-radius: 8px;
  padding: 12px;
  min-height: 46px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
/* 无懈链状态提示：抵消中 / 已恢复（M11） */
.wuxie-chain {
  margin: 0 4px;
  color: #e0b050;
  font-size: 12px;
}
.guanxing-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.gx-chip {
  width: 64px;
  height: 88px;
  position: relative;
  cursor: pointer;
}
.gx-order {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: #7fd37f;
}
.skill-trigger {
  color: #e5b567;
  font-weight: bold;
}
.thinking {
  color: #e5b567;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
