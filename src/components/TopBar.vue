<script setup lang="ts">
// 顶栏：品牌、种子开局、身份状态、面板入口与对局操作。对局状态由父级持有，这里只发意图。
import { ref } from 'vue';
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
  toggleSaves: [];
}>();

const moreMenu = ref<HTMLDetailsElement | null>(null);

function closeMore() {
  moreMenu.value?.removeAttribute('open');
}

/** v-model.number 的 looseToNumber 语义：非数字串（如清空输入框）原样回传，不强制 0 */
function looseToNumber(val: string): number {
  const n = Number.parseFloat(val);
  return Number.isNaN(n) ? (val as unknown as number) : n;
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-seal" aria-hidden="true">杀</span>
      <div class="brand-copy">
        <h1>三国杀<span>单机</span></h1>
        <p>SOLO · 五人身份局 <b>M25</b></p>
      </div>
    </div>

    <div class="topbar-controls">
      <div class="seed-control">
        <label for="seed-input">对局种子</label>
        <input
          id="seed-input"
          :value="seedInput"
          class="seed-input"
          type="number"
          min="0"
          title="填入种子后点“按此种子开局”，即可复现同一局"
          @input="$emit('update:seedInput', looseToNumber(($event.target as HTMLInputElement).value))"
        />
        <button class="btn ghost seed-start" @click="$emit('seedStart')">按此种子开局</button>
      </div>

      <div class="primary-actions">
        <button class="btn ghost spectate-action" @click="$emit('spectate')">观战（5 AI）</button>

        <div class="identity-slot">
          <span v-if="spectate" class="badge dead-badge"><i />观战中（5 AI 自战）</span>
          <template v-else>
            <span v-if="me" class="badge" :class="'id-' + me.identity">
              你的身份：{{ IDENTITY_NAMES[me.identity] }}
            </span>
            <span v-else class="badge dead-badge"><i />你已阵亡 · 观战中</span>
          </template>
        </div>

        <details ref="moreMenu" class="topbar-more">
          <summary>更多</summary>
          <div class="more-menu" aria-label="更多游戏操作">
            <button class="btn ghost" @click="closeMore(); $emit('toggleCodex')">武将图鉴</button>
            <button class="btn ghost" @click="closeMore(); $emit('toggleStats')">战绩统计</button>
            <button class="btn ghost" @click="closeMore(); $emit('toggleSettings')">设置</button>
            <button class="btn ghost" @click="closeMore(); $emit('toggleSaves')">手动存档</button>
            <button
              v-if="saveExists"
              class="btn ghost"
              title="从本地自动槽继续上一局"
              @click="closeMore(); $emit('resume')"
            >继续上局</button>
            <button class="btn" @click="closeMore(); $emit('newGame')">新一局</button>
          </div>
        </details>
      </div>
    </div>
  </header>
</template>

<style>
.topbar {
  position: sticky;
  top: 8px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 15px;
  background:
    linear-gradient(110deg, rgb(217 181 111 / 7%), transparent 30%),
    rgb(14 21 25 / 88%);
  box-shadow: 0 12px 30px rgb(0 0 0 / 28%), inset 0 1px rgb(255 255 255 / 4%);
  backdrop-filter: blur(16px) saturate(1.15);
}

.brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.brand-seal {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #a9433f;
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 12%), transparent 44%),
    #7e2d2b;
  box-shadow: inset 0 0 0 2px rgb(0 0 0 / 16%), 0 4px 10px rgb(0 0 0 / 30%);
  color: #f1d8b2;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 21px;
  font-weight: 900;
}

.brand-copy {
  display: flex;
  flex-direction: column;
}

.brand-copy h1 {
  color: var(--text, #f2ead8);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 19px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.15;
  white-space: nowrap;
}

.brand-copy h1 span {
  margin-left: 5px;
  color: var(--gold, #d9b56f);
  font-size: 13px;
  letter-spacing: 0.14em;
}

.brand-copy p {
  margin-top: 2px;
  color: #6f7d84;
  font: 700 8px/1.2 Georgia, serif;
  letter-spacing: 0.16em;
  white-space: nowrap;
}

.brand-copy p b {
  margin-left: 4px;
  color: #9b7f4e;
  font-size: 8px;
}

.topbar-controls {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.seed-control {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 8px;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: 9px;
  background: rgb(0 0 0 / 10%);
}

.seed-control label {
  color: #718087;
  font-size: 9px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.seed-input {
  width: 78px;
  height: 27px;
  padding: 3px 6px;
  font-size: 11px;
}

.seed-start {
  min-height: 27px;
  padding: 3px 8px;
  font-size: 10px;
}

.primary-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.topbar-more {
  position: relative;
}

.topbar-more > summary {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid #46535c;
  border-radius: 8px;
  background: linear-gradient(180deg, rgb(255 255 255 / 4%), rgb(255 255 255 / 1%));
  color: #cbd3d7;
  font-size: 11px;
  font-weight: 700;
  list-style: none;
  cursor: pointer;
  user-select: none;
}

.topbar-more > summary::-webkit-details-marker {
  display: none;
}

.topbar-more > summary::after {
  content: '⌄';
  margin-left: 5px;
  color: #8e7950;
  font-size: 11px;
}

.topbar-more[open] > summary,
.topbar-more > summary:hover,
.topbar-more > summary:focus-visible {
  border-color: var(--gold-dim);
  color: var(--gold-bright);
  outline: none;
}

.more-menu {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  z-index: 40;
  display: grid;
  width: 190px;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgb(217 181 111 / 24%);
  border-radius: 10px;
  background: rgb(15 22 26 / 98%);
  box-shadow: 0 18px 40px rgb(0 0 0 / 56%);
  backdrop-filter: blur(12px);
}

.more-menu .btn {
  width: 100%;
  min-height: 34px;
}

.identity-slot {
  display: flex;
  align-items: center;
}

.identity-slot .badge i {
  width: 5px;
  height: 5px;
  margin-right: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}


.topbar .btn {
  min-height: 30px;
  padding: 4px 9px;
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 1120px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .topbar-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .primary-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .topbar {
    position: relative;
    top: 0;
    gap: 9px;
    padding: 9px;
    border-radius: 12px;
  }

  .brand-seal {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }

  .brand-copy h1 {
    font-size: 17px;
  }

  .topbar-controls {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .seed-control {
    width: 100%;
    min-width: 0;
  }

  .seed-control label {
    min-width: 48px;
  }

  .seed-input {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .primary-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }

  .spectate-action {
    min-height: 44px;
  }

  .identity-slot {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .topbar-more {
    grid-column: 2;
    grid-row: 1;
  }

  .topbar-more > summary {
    min-height: 44px;
  }

  .more-menu {
    right: 0;
    width: min(240px, calc(100vw - 32px));
  }

  .more-menu .btn {
    min-height: 44px;
  }
}
</style>
