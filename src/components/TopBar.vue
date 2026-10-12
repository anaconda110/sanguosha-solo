<script setup lang="ts">
// 顶栏（M22 自 App.vue 迁出）：标题/种子开局/身份徽章/面板开关/续局/观战/新一局。
// props in / events out：对局状态由父级持有，这里只发意图。
import type { Identity } from '../engine/types';
import { IDENTITY_NAMES } from '../engine/types';

defineProps<{
  seedInput: number;
  spectate: boolean;
  /** 真人视角（观战/阵亡时 null，徽章相应降级）；结构兼容 view.me */
  me: { id: number; identity: Identity } | null;
  saveExists: boolean;
}>();
defineEmits<{
  'update:seedInput': [v: number];
  seedStart: [];
  resume: [];
  spectate: [];
  newGame: [];
  toggleCodex: [];
  toggleStats: [];
  toggleSettings: [];
}>();

/** v-model.number 的 looseToNumber 语义：非数字串（如清空输入框）原样回传，不强制 0 */
function looseToNumber(val: string): number {
  const n = Number.parseFloat(val);
  return Number.isNaN(n) ? (val as unknown as number) : n;
}
</script>

<template>
  <header>
    <h1>三国杀单机 <span class="m1">M18</span></h1>
    <div class="meta">
      <span class="seed">
        seed
        <input
          :value="seedInput"
          class="seed-input"
          type="number"
          min="0"
          title="填入种子后点“按此种子开局”，即可复现同一局"
          @input="$emit('update:seedInput', looseToNumber(($event.target as HTMLInputElement).value))"
        />
      </span>
      <button class="btn ghost" @click="$emit('seedStart')">按此种子开局</button>
      <span v-if="spectate" class="badge dead-badge">观战中（5 AI 自战）</span>
      <template v-else>
        <span v-if="me" class="badge" :class="'id-' + me.identity">
          你的身份：{{ IDENTITY_NAMES[me.identity] }}
        </span>
        <span v-else class="badge dead-badge">你已阵亡 · 观战中</span>
      </template>
      <button class="btn ghost" @click="$emit('toggleCodex')">武将图鉴</button>
      <button class="btn ghost" @click="$emit('toggleStats')">战绩统计</button>
      <button class="btn ghost" @click="$emit('toggleSettings')">设置</button>
      <button
        v-if="saveExists"
        class="btn ghost"
        title="从本地存档继续上一局"
        @click="$emit('resume')"
      >继续上局</button>
      <button class="btn ghost" @click="$emit('spectate')">观战（5 AI）</button>
      <button class="btn" @click="$emit('newGame')">新一局</button>
    </div>
  </header>
</template>

<style>
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
h1 {
  font-size: 20px;
}
.m1 {
  color: #e5b567;
  font-size: 14px;
  border: 1px solid #e5b567;
  border-radius: 4px;
  padding: 1px 6px;
  vertical-align: middle;
}
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.seed {
  color: #6b7280;
  font-size: 12px;
}
.seed-input {
  width: 86px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid #3a4250;
  background: #1b1f27;
  color: #cfd5df;
  font-size: 12px;
}
</style>
