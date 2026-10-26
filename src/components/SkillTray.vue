<script setup lang="ts">
// 我的技能托盘：只解释主动技为何可用/不可用，真实发动入口仍由 PromptBar 持有。
import { computed } from 'vue';
import type { GameApi } from '../composables/types';
import { skillTrayEntries } from '../interaction/skills';

const props = defineProps<{ game: GameApi }>();
const { me, meP, mySkills, pend, view, spectate, getState, lijianReady } = props.game;

const entries = computed(() => {
  void view.value; // state.usedSkills 是普通对象字段，借视图刷新重算
  const players = view.value.players;
  return skillTrayEntries({
    skills: mySkills.value,
    usedSkills: getState().usedSkills,
    pendingKind: pend.value?.kind ?? null,
    handCount: me.value?.hand.length ?? 0,
    hp: meP.value?.hp ?? 0,
    maxHp: meP.value?.maxHp ?? 0,
    injuredCount: players.filter(p => p.alive && p.hp < p.maxHp).length,
    injuredMaleCount: players.filter(p => p.alive && p.sex === 'm' && p.hp < p.maxHp).length,
    otherAliveCount: players.filter(p => p.alive && p.id !== me.value?.id).length,
    lijianReady: lijianReady.value,
  });
});
</script>

<template>
  <section v-if="!spectate && entries.length" class="skill-tray" aria-label="我的技能状态">
    <header class="skill-tray-head">
      <span>MY SKILLS</span>
      <b>技能状态</b>
    </header>
    <div class="skill-tray-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="skill-pill"
        :class="[entry.kind, { available: entry.available }]"
        :title="`${entry.description} — ${entry.reason}`"
      >
        <span class="skill-pill-dot" aria-hidden="true" />
        <span class="skill-pill-name">{{ entry.name }}</span>
        <span class="skill-pill-reason">{{ entry.reason }}</span>
      </div>
    </div>
    <p class="skill-tray-tip">主动技需要在底部提示栏选择；这里只显示当前可用性。</p>
  </section>
</template>

<style scoped>
.skill-tray {
  margin: 0 0 10px;
  padding: 9px 10px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: rgb(16 23 27 / 74%);
}
.skill-tray-head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 6px;
}
.skill-tray-head span {
  color: #675f4d;
  font: 700 7px/1.2 Georgia, serif;
  letter-spacing: 0.18em;
}
.skill-tray-head b {
  color: #b6a177;
  font-size: 10px;
  letter-spacing: 0.08em;
}
.skill-tray-list {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.skill-pill {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 1px solid #37434b;
  border-radius: 999px;
  background: rgb(0 0 0 / 11%);
  color: #829097;
  font-size: 9px;
}
.skill-pill.available {
  border-color: rgb(217 181 111 / 40%);
  background: rgb(217 181 111 / 8%);
  color: #d9c18f;
}
.skill-pill-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #536168;
}
.skill-pill.available .skill-pill-dot {
  background: #d9b56f;
  box-shadow: 0 0 6px rgb(217 181 111 / 70%);
}
.skill-pill-name {
  font-weight: 700;
}
.skill-pill-reason {
  max-width: 210px;
  overflow: hidden;
  color: #69777e;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-pill.available .skill-pill-reason {
  color: #9b8b69;
}
.skill-tray-tip {
  margin-top: 6px;
  color: #5e6c73;
  font-size: 8px;
}
</style>
