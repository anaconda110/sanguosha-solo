<script setup lang="ts">
// 武将图鉴（M22 自 App.vue 迁出）：全武将技能速查。纯展示，无内部状态。
// 外框样式（.codex 网格盒）由 App.vue 全局样式提供——设置/战绩面板共用同款外框。
import { GENERAL_INFO, GENERAL_SEX, GENERAL_SKILLS, SKILL_INFO } from '../engine/types';
</script>

<template>
  <section class="codex">
    <div v-for="(info, g) in GENERAL_INFO" :key="g" class="codex-item">
      <span class="codex-name" :class="{ 'codex-f': GENERAL_SEX[g] === 'f' }">{{ info.display }}</span>
      <span class="codex-skills">
        <span v-for="sk in GENERAL_SKILLS[g]" :key="sk" class="codex-skill">
          <b>【{{ SKILL_INFO[sk].display }}】</b>{{ SKILL_INFO[sk].desc }}
        </span>
        <span v-if="GENERAL_SKILLS[g].length === 0" class="codex-skill">无技能</span>
      </span>
    </div>
  </section>
</template>

<style>
.codex-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.codex-name {
  font-weight: bold;
  white-space: nowrap;
}
.codex-f {
  color: #e88ab0;
}
.codex-skills {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #9aa3b2;
}
.codex-skill b {
  color: #c8d2e0;
}
</style>
