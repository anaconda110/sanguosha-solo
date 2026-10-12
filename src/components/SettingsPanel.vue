<script setup lang="ts">
// 设置面板（M18，M22 自 App.vue 迁出）：音效/音量/节奏/AI 难度。
// props in / events out：设置对象由父级（useSettings）持有，此处只发 change 补丁。
import type { Settings } from '../settings';

defineProps<{ settings: Settings }>();
const emit = defineEmits<{ change: [patch: Partial<Settings>] }>();
</script>

<template>
  <section class="codex settings-panel">
    <div class="settings-grid">
      <label>AI 难度</label>
      <select :value="settings.difficulty" @change="emit('change', { difficulty: ($event.target as HTMLSelectElement).value as Settings['difficulty'] })">
        <option value="easy">简单（规则型 AI，响应快）</option>
        <option value="normal">普通（首个出牌决策走蒙特卡洛）</option>
      </select>
      <label>音效</label>
      <label class="settings-inline">
        <input type="checkbox" :checked="settings.soundOn" @change="emit('change', { soundOn: ($event.target as HTMLInputElement).checked })" />
        {{ settings.soundOn ? '开' : '关' }}
      </label>
      <label>音量</label>
      <input
        type="range"
        min="0"
        max="100"
        :value="Math.round(settings.volume * 100)"
        @input="emit('change', { volume: Number(($event.target as HTMLInputElement).value) / 100 })"
      />
      <label>动画节奏</label>
      <select :value="settings.speed" @change="emit('change', { speed: Number(($event.target as HTMLSelectElement).value) })">
        <option :value="1">原速</option>
        <option :value="1.5">1.5 倍</option>
        <option :value="2">2 倍（快进）</option>
      </select>
    </div>
    <p class="settings-tip">难度与节奏即时生效；音效试听：出一张牌即可。设置存本地，与对局存档相互独立。</p>
  </section>
</template>

<style>
/* 设置面板（M18） */
.settings-panel {
  margin-bottom: 12px;
}
.settings-grid {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 10px 14px;
  align-items: center;
  font-size: 13px;
}
.settings-grid label {
  color: #9aa3b2;
}
.settings-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.settings-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: #6b7280;
}
.settings-grid select,
.settings-grid input[type='range'] {
  accent-color: #e05555;
}
.settings-grid select {
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid #3a4250;
  background: #1b1f27;
  color: #cfd5df;
}
</style>
