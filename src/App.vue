<script setup lang="ts">
// 组合根：只负责创建各 composable、按依赖单向接线、编排布局。
// 领域逻辑在 composables/，视觉单元在 components/，全局设计令牌与基础控件样式留在本文件。
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
import ReplayReport from './components/ReplayReport.vue';
import TableArea from './components/TableArea.vue';
import PromptBar from './components/PromptBar.vue';
import SeatTip from './components/SeatTip.vue';
import HandArea from './components/HandArea.vue';
import LogPanel from './components/LogPanel.vue';
import SaveSlots from './components/SaveSlots.vue';
import SkillTray from './components/SkillTray.vue';
import TutorialCoach from './components/TutorialCoach.vue';
import ActionDock from './components/ActionDock.vue';
import ReplayTimeline from './components/ReplayTimeline.vue';
import { buildEventActionIndex, actionCountForEvent } from './replay/seek';

/** 武将图鉴面板开关 */
const showCodex = ref(false);
const showSaves = ref(false);
const saveNotice = ref('');

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
const {
  seed, view, humanId, spectate, me, saveExists, saveSlots, seedInput, replayIdx, replayTotal, applyStep,
} = game;
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

/** 公开事件序号 → 回放动作数；读取 view 以在每次状态推进后失效重算。 */
const eventActionIndex = computed(() => {
  void view.value.log.length;
  return buildEventActionIndex(seed.value, game.getState().actionLog);
});

function seekToEvent(eventSeq: number) {
  game.showReplay(actionCountForEvent(eventActionIndex.value, eventSeq));
}

function toggleSaves() {
  showSaves.value = !showSaves.value;
  if (showSaves.value) {
    saveNotice.value = '';
    game.refreshSaveSlots();
  }
}

function saveSlot(slotId: string) {
  saveNotice.value = game.saveCurrentToSlot(slotId)
    ? `已保存到槽位 ${slotId}`
    : '保存失败：本地存储空间不足或不可用';
}

function loadSlot(slotId: string) {
  if (!game.loadFromSlot(slotId)) {
    saveNotice.value = '读取失败：存档为空或已损坏';
    return;
  }
  saveNotice.value = '';
  showSaves.value = false;
}

function deleteSlot(slotId: string) {
  game.deleteSlot(slotId);
  saveNotice.value = `已删除槽位 ${slotId}`;
}

// 调度链不变量②（docs/adr/0025-ai-chain-invariant.md）：初始调度必须在 settings 初始化
// 之后、位于 setup 顶层执行一次——上面所有 composable 均已创建，此处调用时序与原实现一致。
void scheduleAi();
configureSound(settings.value.soundOn, settings.value.volume);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.matches('input, textarea, select') || el.isContentEditable);
}

/** Esc 按层级退出：面板 → 引导 → 当前选牌会话。输入控件内不劫持。 */
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || isTypingTarget(event.target)) return;
  if (showCodex.value) {
    showCodex.value = false;
    return;
  }
  if (showStats.value) {
    showStats.value = false;
    return;
  }
  if (showSettings.value) {
    showSettings.value = false;
    return;
  }
  if (showSaves.value) {
    showSaves.value = false;
    return;
  }
  if (showIntro.value) {
    dismissIntro();
    return;
  }
  interact.resetAll();
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown));
</script>

<template>
  <div class="app-shell">
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
      @toggle-saves="toggleSaves"
    />

    <div v-if="showSettings || showStats || showCodex || showSaves" class="utility-dock">
      <SettingsPanel v-if="showSettings" :settings="settings" @change="updateSettings" />
      <StatsPanel v-if="showStats" :stats="stats" />
      <CodexPanel v-if="showCodex" />
      <SaveSlots
        v-if="showSaves"
        :slots="saveSlots"
        :notice="saveNotice"
        @close="showSaves = false"
        @save="saveSlot"
        @load="loadSlot"
        @delete="deleteSlot"
      />
    </div>

    <main class="game-layout">
      <div class="play-column">
        <section v-if="view.winner" class="winner" aria-live="polite">
          <div class="winner-summary">
            <span class="winner-emblem" aria-hidden="true">勝</span>
            <div class="winner-copy">
              <span class="winner-kicker">GAME OVER</span>
              <strong>{{ SIDE_NAMES[view.winner.side] }} 获胜</strong>
              <span class="winner-meta">
                seed {{ seed }} · {{ spectate ? '5 AI 观战局' : '你的对局已归档' }}
              </span>
            </div>
          </div>
          <div class="winner-tools">
            <ReplayBar
              :replay-idx="replayIdx"
              :replay-total="replayTotal"
              @seek="game.showReplay($event)"
            />
            <ReplayReport
              :seed="seed"
              :human-id="humanId"
              :spectate="spectate"
              :action-log="game.getState().actionLog"
            />
          </div>
          <ReplayTimeline
            :events="view.log"
            :players="view.players"
            @seek="seekToEvent"
          />
        </section>

        <TableArea :game="game" :anim="anim" :interact="interact" />
        <TutorialCoach :game="game" :interact="interact" />
        <SkillTray :game="game" />
        <PromptBar :game="game" :interact="interact" :ui="ui" :thinking="thinking" />
        <SeatTip :game="game" :interact="interact" />
        <HandArea :game="game" :interact="interact" />
        <ActionDock :game="game" :interact="interact" />
      </div>

      <aside class="side-column" aria-label="战局辅助信息">
        <LogPanel
          :events="view.log"
          :players="view.players"
          :replaying="replayIdx != null"
          @seek="seekToEvent"
        />
        <div class="shortcut-card">
          <span class="shortcut-title">操作提示</span>
          <span><kbd>Esc</kbd> 取消当前选择</span>
          <span><kbd>Tab</kbd> 浏览手牌</span>
          <span>拖拽手牌到高亮座次可直接出牌</span>
        </div>
      </aside>
    </main>
  </div>
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #0b1114;
  --panel: #151c22;
  --panel-raised: #1b242a;
  --line: #34404a;
  --line-soft: #273138;
  --text: #f2ead8;
  --muted: #8b99a5;
  --gold: #d9b56f;
  --gold-bright: #f0d393;
  --gold-dim: #8b7044;
  --red: #b84c4c;
  --green: #62b47a;
  --shadow: 0 15px 36px rgb(0 0 0 / 28%);
  --shadow-sm: 0 8px 20px rgb(0 0 0 / 18%);
}

* {
  box-sizing: border-box;
  margin: 0;
}

html {
  min-width: 320px;
  min-height: 100%;
  background: var(--bg);
}

body {
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(ellipse at 16% -6%, rgb(73 108 91 / 20%), transparent 38%),
    radial-gradient(ellipse at 90% 12%, rgb(121 87 38 / 11%), transparent 34%),
    repeating-linear-gradient(96deg, rgb(255 255 255 / 0.8%) 0 1px, transparent 1px 9px),
    linear-gradient(155deg, #0d1518 0%, #0b1114 55%, #10161a 100%);
  background-attachment: fixed;
  color: var(--text);
  font-family: 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: radial-gradient(circle at 50% 110%, rgb(217 181 111 / 5%), transparent 42%);
  pointer-events: none;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

#app {
  min-height: 100vh;
}

.app-shell {
  position: relative;
  width: 100%;
  max-width: 1240px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 14px;
}

.game-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
  align-items: start;
}

.play-column {
  min-width: 0;
}

.side-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.side-column .log {
  position: sticky;
  top: 92px;
}

.utility-dock {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

/* 通用控件：暖金主操作、墨绿/透明次操作，不再使用纯蓝按钮。 */
.btn {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 13px;
  border: 1px solid #b89250;
  border-radius: 8px;
  background: linear-gradient(180deg, #e8c986 0%, #d2aa5e 100%);
  box-shadow: inset 0 1px rgb(255 255 255 / 45%), 0 4px 12px rgb(0 0 0 / 24%);
  color: #221a0e;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  text-shadow: 0 1px rgb(255 255 255 / 22%);
  cursor: pointer;
  transition: transform 130ms ease, filter 130ms ease, border-color 130ms ease, background 130ms ease;
}

.btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
  border-color: var(--gold-bright);
}

.btn:active:not(:disabled) {
  transform: translateY(0);
}

.btn.ghost {
  border-color: #46535c;
  background: linear-gradient(180deg, rgb(255 255 255 / 4%), rgb(255 255 255 / 1%));
  box-shadow: inset 0 1px rgb(255 255 255 / 4%);
  color: #cbd3d7;
  text-shadow: none;
}

.btn.ghost:hover:not(:disabled) {
  border-color: var(--gold-dim);
  background: rgb(217 181 111 / 8%);
  color: var(--gold-bright);
}

.btn.danger {
  border-color: #8d4545;
  background: linear-gradient(180deg, #b85858, #8d3d3d);
  color: #fff4ee;
}

.btn:disabled {
  border-color: #303a40;
  background: #293238;
  box-shadow: none;
  color: #69767d;
  text-shadow: none;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.btn:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

input,
select,
textarea {
  border: 1px solid #3c4851;
  border-radius: 7px;
  background: #10171b;
  color: #e8e1d2;
  caret-color: var(--gold);
}

input::placeholder,
textarea::placeholder {
  color: #66747c;
}

input[type='range'] {
  accent-color: var(--gold);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}

.id-zhu {
  border: 1px solid rgb(218 160 93 / 35%);
  background: rgb(122 59 18 / 54%);
  color: #ffd9a8;
}

.id-zhong {
  border: 1px solid rgb(99 181 125 / 28%);
  background: rgb(30 77 43 / 60%);
  color: #b8f0c8;
}

.id-fan {
  border: 1px solid rgb(210 105 105 / 28%);
  background: rgb(92 31 31 / 62%);
  color: #ffc4c4;
}

.id-nei {
  border: 1px solid rgb(157 132 220 / 28%);
  background: rgb(58 45 92 / 68%);
  color: #d3c4ff;
}

.dead-badge {
  border: 1px solid #39434a;
  background: #252c31;
  color: #8f9ba2;
}

kbd {
  display: inline-flex;
  min-width: 22px;
  min-height: 19px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid #46545c;
  border-bottom-color: #596871;
  border-radius: 4px;
  background: #151c20;
  box-shadow: 0 1px 0 #070a0c;
  color: #9daab1;
  font: 700 10px/1 'Cascadia Mono', Consolas, monospace;
}

/* 终局摘要卡：保留老 .winner 钩子，同时承载回放与复盘入口。 */
.winner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 14px 16px;
  border: 1px solid rgb(217 181 111 / 42%);
  border-radius: 14px;
  background:
    radial-gradient(circle at 10% 20%, rgb(217 181 111 / 15%), transparent 34%),
    linear-gradient(135deg, #242015, #171d1d 58%, #151c22);
  box-shadow: 0 0 30px rgb(217 181 111 / 8%), var(--shadow-sm);
}

.winner-summary {
  display: flex;
  min-width: 230px;
  align-items: center;
  gap: 12px;
}

.winner-emblem {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(217 181 111 / 44%);
  border-radius: 50%;
  background: rgb(0 0 0 / 22%);
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 22px;
  box-shadow: inset 0 0 16px rgb(217 181 111 / 10%);
}

.winner-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.winner-kicker {
  color: #8d7953;
  font: 700 8px/1.2 Georgia, serif;
  letter-spacing: 0.22em;
}

.winner-copy strong {
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 21px;
  letter-spacing: 0.04em;
}

.winner-meta {
  color: #8d999f;
  font-size: 10px;
}

.winner-tools {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.shortcut-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: rgb(16 23 27 / 74%);
  color: #79878f;
  font-size: 10px;
  line-height: 1.5;
}

.shortcut-title {
  margin-bottom: 1px;
  color: #b6a177;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

/* 图鉴 / 设置 / 战绩共用外框。 */
.codex {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  max-height: 380px;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 20%),
    var(--panel);
  box-shadow: var(--shadow-sm);
  color: #aeb9bf;
  scrollbar-color: #3a474f transparent;
  scrollbar-width: thin;
}

.codex-item {
  padding: 7px 8px;
  border-bottom: 1px solid rgb(255 255 255 / 4%);
}

.settings-panel,
.stats-panel {
  display: block;
  max-height: none;
}

.settings-panel .settings-grid select,
.settings-panel .settings-grid input[type='range'] {
  accent-color: var(--gold);
}

.settings-panel .settings-grid select {
  padding: 6px 8px;
}

.settings-panel .settings-tip,
.settings-panel .settings-grid label {
  color: var(--muted);
}

.stats-panel .stats-head > b {
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 16px;
}

.stats-panel .stats-line {
  color: var(--muted);
}

.stats-panel .stats-table th,
.stats-panel .stats-table td {
  border-bottom-color: var(--line-soft);
}

.stats-panel .stats-table th {
  color: #718087;
}

@media (max-width: 1000px) {
  .game-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .side-column .log {
    position: static;
  }
}

@media (max-width: 760px) {
  .app-shell {
    padding: 9px;
  }

  .game-layout {
    gap: 10px;
  }

  .utility-dock {
    grid-template-columns: 1fr;
  }

  .codex {
    grid-template-columns: 1fr;
    max-height: 340px;
  }

  .winner {
    align-items: flex-start;
    padding: 12px;
  }

  .winner-summary {
    min-width: 0;
  }

  .winner-copy strong {
    font-size: 18px;
  }

  .winner-tools {
    width: 100%;
    justify-content: stretch;
  }

  .winner-tools > * {
    flex: 1 1 100%;
  }

  .shortcut-card {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
