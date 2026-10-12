<script setup lang="ts">
// 组合根（M22 拆分后）：只负责创建各 composable、按依赖单向接线、编排布局。
// 领域逻辑在 composables/，视觉单元在 components/，全局样式（.btn/.badge/.id-*）留在本文件底部。
import { ref } from 'vue';
import { configureSound } from './sound';
import { SIDE_NAMES } from './composables/labels';
import { useSettings } from './composables/useSettings';
import { useAnimations } from './composables/useAnimations';
import { useScheduler } from './composables/useScheduler';
import { useGame } from './composables/useGame';
import { useInteraction } from './composables/useInteraction';
import { useStats } from './composables/useStats';
import IntroOverlay from './components/IntroOverlay.vue';
import TopBar from './components/TopBar.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import CodexPanel from './components/CodexPanel.vue';
import ReplayBar from './components/ReplayBar.vue';
import TableArea from './components/TableArea.vue';
import PromptBar from './components/PromptBar.vue';
import SeatTip from './components/SeatTip.vue';
import HandArea from './components/HandArea.vue';
import LogPanel from './components/LogPanel.vue';

/** 武将图鉴面板开关 */
const showCodex = ref(false);

// —— 组合根接线：依赖单向 ui ← anim ← game ← scheduler/interaction/stats，
//    game→scheduler 与 game→interaction 的反向调用经懒箭头注入（声明顺序无关，调用都发生在 setup 完成后）——
const ui = useSettings();
const { settings, showSettings, updateSettings, showIntro, dismissIntro } = ui;
const anim = useAnimations(settings);
let interactReset: () => void = () => {}; // useInteraction 建立后覆写
const game = useGame({
  anim,
  scheduleAi: () => scheduleAi(),
  resetSession: () => interactReset(),
});
const { view, humanId, spectate, me, saveExists, seedInput, replayIdx, replayTotal, applyStep } = game;
const scheduler = useScheduler({
  settings,
  view,
  spectate,
  humanId,
  getState: game.getState,
  getGameId: game.getGameId,
  applyStep,
});
const { thinking, scheduleAi } = scheduler;
const interact = useInteraction({ game });
interactReset = interact.resetAll;
const stats = useStats();
const { showStats } = stats;

// 调度链不变量②（docs/adr/0025-ai-chain-invariant.md）：初始调度必须在 settings 初始化
// 之后、位于 setup 顶层执行一次——上面所有 composable 均已创建，此处调用时序与原实现一致。
void scheduleAi();
configureSound(settings.value.soundOn, settings.value.volume);
</script>

<template>
  <div class="app">
    <IntroOverlay v-if="showIntro" @dismiss="dismissIntro" />
    <TopBar
      v-model:seed-input="seedInput"
      :spectate="spectate"
      :me="me"
      :save-exists="saveExists"
      @seed-start="game.newGameWithSeed()"
      @resume="game.resumeGame()"
      @spectate="game.startSpectate()"
      @new-game="game.newGame()"
      @toggle-codex="showCodex = !showCodex"
      @toggle-stats="showStats = !showStats"
      @toggle-settings="showSettings = !showSettings"
    />

    <SettingsPanel v-if="showSettings" :settings="settings" @change="updateSettings" />

    <StatsPanel v-if="showStats" :stats="stats" />

    <CodexPanel v-if="showCodex" />

    <div v-if="view.winner" class="winner">🏆 {{ SIDE_NAMES[view.winner.side] }} 获胜</div>

    <ReplayBar v-if="view.winner" :replay-idx="replayIdx" :replay-total="replayTotal" @seek="game.showReplay($event)" />

    <TableArea :game="game" :anim="anim" :interact="interact" />

    <PromptBar :game="game" :interact="interact" :ui="ui" :thinking="thinking" />

    <SeatTip :game="game" :interact="interact" />

    <HandArea :game="game" :interact="interact" />

    <LogPanel :events="view.log" :players="view.players" />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
}
body {
  background: #171a21;
  color: #d8dee9;
  font-family: 'Microsoft YaHei', system-ui, sans-serif;
}
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
.badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 13px;
}
.id-zhu {
  background: #7a3b12;
  color: #ffd9a8;
}
.id-zhong {
  background: #1e4d2b;
  color: #b8f0c8;
}
.id-fan {
  background: #5c1f1f;
  color: #ffc4c4;
}
.id-nei {
  background: #3a2d5c;
  color: #d3c4ff;
}
.dead-badge {
  background: #333;
  color: #999;
}
.btn {
  background: #2d6cdf;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
.btn.ghost {
  background: transparent;
  border: 1px solid #4a5160;
  color: #9aa3b2;
}
.btn:disabled {
  background: #444;
  color: #888;
  cursor: not-allowed;
}
.winner {
  text-align: center;
  font-size: 22px;
  padding: 10px;
  background: #2c2413;
  border: 1px solid #e5b567;
  border-radius: 8px;
  margin-bottom: 8px;
}
</style>
