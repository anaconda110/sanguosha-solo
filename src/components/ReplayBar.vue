<script setup lang="ts">
// 回放条（M15，M22 自 App.vue 迁出）：终局后拖动/步进回看整局。
// seek(k) 交由父级 useGame.showReplay 执行（重演引擎动作）；本组件只维护数字输入框镜像。
import { ref, watch } from 'vue';

const props = defineProps<{ replayIdx: number | null; replayTotal: number }>();
const emit = defineEmits<{ seek: [k: number | null] }>();

const replayInput = ref<number | null>(null);
watch(
  () => props.replayIdx,
  k => (replayInput.value = k), // showReplay 后同步输入框（原实现内联赋值）
);

/** 回放进度条拖动：数字输入即时跳转（越界钳制） */
function onReplaySeek() {
  const v = Number(replayInput.value ?? 0);
  if (!Number.isFinite(v)) return;
  emit('seek', Math.max(0, Math.min(props.replayTotal, Math.floor(v))));
}
</script>

<template>
  <div class="replay-bar">
    <span>回放</span>
    <button class="btn ghost" @click="emit('seek', Math.max(0, (replayIdx ?? replayTotal) - 1))">◀</button>
    <input
      class="replay-seek"
      type="range"
      min="0"
      :max="replayTotal"
      :value="replayIdx ?? replayTotal"
      title="拖动跳转到任意时刻"
      @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
    />
    <input
      v-model.number="replayInput"
      class="replay-num"
      type="number"
      min="0"
      :max="replayTotal"
      @change="onReplaySeek"
    />
    <span class="replay-total">/ {{ replayTotal }}</span>
    <button class="btn ghost" @click="emit('seek', Math.min(replayTotal, (replayIdx ?? replayTotal) + 1))">▶</button>
    <button class="btn ghost" @click="emit('seek', null)">退出回放</button>
  </div>
</template>

<style>
.replay-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: #9aa3b2;
  margin-bottom: 12px;
}
/* 回放拖动条（M15） */
.replay-seek {
  width: 220px;
  accent-color: #e05555;
}
.replay-num {
  width: 68px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid #3a4250;
  background: #1b1f27;
  color: #cfd5df;
  font-size: 12px;
}
.replay-total {
  color: #6b7280;
}
</style>
