<script setup lang="ts">
// 移动端操作坞：把当前选择、目标候选数与取消入口固定在拇指容易触达的位置。
// 不复制 PromptBar 的真实询问按钮，避免两条提交路径产生分歧。
import { computed } from 'vue';
import type { GameApi, InteractionApi } from '../composables/types';
import { CARD_INFO } from '../engine/types';

const props = defineProps<{ game: GameApi; interact: InteractionApi }>();
const { pend, spectate, view } = props.game;
const {
  hasSelection, interactionBreadcrumb, targetCandidateCount, targetSelectedCount,
  resetAll, selectedCard,
} = props.interact;

const visible = computed(() =>
  !spectate.value && !view.value.winner && pend.value?.kind === 'play',
);
const detail = computed(() => {
  if (!hasSelection.value) return '点高亮手牌开始选择';
  if (targetCandidateCount.value === 0) return '当前无需选择目标';
  if (targetSelectedCount.value > 0) {
    return `已选 ${targetSelectedCount.value} 个目标 · 共 ${targetCandidateCount.value} 个可选`;
  }
  return `${targetCandidateCount.value} 个可选目标 · 点击高亮座次`;
});
</script>

<template>
  <aside v-if="visible" class="action-dock" aria-label="移动端操作摘要">
    <div class="action-dock-copy">
      <strong>{{ selectedCard ? `已选【${CARD_INFO[selectedCard.sub].display}】` : interactionBreadcrumb }}</strong>
      <span>{{ detail }}</span>
    </div>
    <button
      type="button"
      class="action-dock-cancel"
      :disabled="!hasSelection"
      @click="resetAll()"
    >取消选择</button>
  </aside>
</template>

<style scoped>
.action-dock {
  display: none;
}
@media (max-width: 760px) {
  .action-dock {
    position: sticky;
    bottom: 8px;
    z-index: 25;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 8px;
    padding: 9px 10px;
    border: 1px solid rgb(217 181 111 / 27%);
    border-radius: 11px;
    background: rgb(15 22 26 / 95%);
    box-shadow: 0 10px 28px rgb(0 0 0 / 48%);
    backdrop-filter: blur(12px);
  }
  .action-dock-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .action-dock-copy strong {
    overflow: hidden;
    color: #e7d6ad;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .action-dock-copy span {
    color: #85939a;
    font-size: 9px;
  }
  .action-dock-cancel {
    min-width: 88px;
    min-height: 44px;
    padding: 6px 10px;
    border: 1px solid #4a5962;
    border-radius: 8px;
    background: #1b242a;
    color: #c7d0d4;
    font-size: 11px;
    cursor: pointer;
  }
  .action-dock-cancel:disabled {
    color: #5e6a70;
    cursor: not-allowed;
  }
}
</style>
