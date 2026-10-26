<script setup lang="ts">
// 首次真人出牌阶段的就地教练：只根据当前公开 UI 状态给下一步提示，不替玩家出牌。
import { computed, ref } from 'vue';
import type { GameApi, InteractionApi } from '../composables/types';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
const { pend, spectate, replayIdx, view } = props.game;
const { selectedCard, targetCandidateCount, targetSelectedCount, activeMode, lijianMode } = props.interact;

const KEY = 'sanguosha-solo:tutorial-seen';
const seen = ref((() => {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
})());

const visible = computed(() =>
  !seen.value &&
  !spectate.value &&
  replayIdx.value == null &&
  !view.value.winner &&
  pend.value?.kind === 'play',
);

const nextStep = computed(() => {
  if (activeMode.value) return `正在发动【${activeMode.value}】：按提示栏要求点选手牌或目标。`;
  if (lijianMode.value) return '离间：先点一张手牌，再依次选择两名存活男性角色。';
  if (selectedCard.value) {
    return targetCandidateCount.value > 0
      ? `已选【${selectedCard.value.sub}】：点击 ${targetCandidateCount.value} 个高亮座次之一${targetSelectedCount.value ? `（已选 ${targetSelectedCount.value}）` : ''}。`
      : '这张牌无需目标，将直接结算。';
  }
  return '先点一张高亮手牌；若需要目标，再点击桌面上的高亮座次。';
});

function dismiss() {
  seen.value = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* localStorage 不可用时本次隐藏即可 */
  }
}
</script>

<template>
  <aside v-if="visible" class="tutorial-coach" aria-label="出牌阶段提示">
    <div class="tutorial-coach-head">
      <span>FIRST PLAY</span>
      <button type="button" aria-label="关闭首次出牌提示" @click="dismiss">×</button>
    </div>
    <strong>第一步：看提示栏</strong>
    <p>{{ nextStep }}</p>
    <ol>
      <li>高亮手牌 = 当前可用；灰暗手牌可在悬停或读屏中看到原因。</li>
      <li>需要目标时，座次会高亮；其他座次会变暗且不可点击。</li>
      <li>要结束出牌，用提示栏里的「结束出牌」。</li>
    </ol>
    <button type="button" class="btn ghost tutorial-coach-dismiss" @click="dismiss">知道了</button>
  </aside>
</template>

<style scoped>
.tutorial-coach {
  margin-bottom: 9px;
  padding: 10px 12px;
  border: 1px solid rgb(217 181 111 / 26%);
  border-radius: 11px;
  background:
    linear-gradient(110deg, rgb(217 181 111 / 9%), transparent 44%),
    #141d21;
  box-shadow: var(--shadow-sm);
  color: #a8b3b8;
}
.tutorial-coach-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.tutorial-coach-head span {
  color: #8c7952;
  font: 700 8px/1.2 Georgia, serif;
  letter-spacing: 0.2em;
}
.tutorial-coach-head button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid #3b4850;
  border-radius: 7px;
  background: transparent;
  color: #9ca9af;
  font-size: 17px;
  cursor: pointer;
}
.tutorial-coach > strong {
  color: #e2d1a7;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 14px;
}
.tutorial-coach p {
  margin: 4px 0 6px;
  color: #c7d0d2;
  font-size: 11px;
  line-height: 1.55;
}
.tutorial-coach ol {
  display: grid;
  gap: 2px;
  margin: 0;
  padding-left: 18px;
  color: #77858c;
  font-size: 9px;
  line-height: 1.55;
}
.tutorial-coach-dismiss {
  min-height: 34px;
  margin-top: 8px;
  padding: 4px 10px;
  font-size: 10px;
}
@media (max-width: 760px) {
  .tutorial-coach-dismiss {
    min-height: 44px;
  }
}
</style>
