<script setup lang="ts">
// 三槽手动存档面板：只展示摘要并发出意图，读写删由组合根调用 useGame。
import { ref } from 'vue';
import type { SaveSlotInfo } from '../persist';

defineProps<{ slots: SaveSlotInfo[]; notice?: string }>();
const emit = defineEmits<{
  close: [];
  save: [slotId: string];
  load: [slotId: string];
  delete: [slotId: string];
}>();

const armedDelete = ref<string | null>(null);

function formatTime(value: number | null): string {
  if (value == null) return '尚未保存';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function requestDelete(slotId: string) {
  if (armedDelete.value === slotId) {
    emit('delete', slotId);
    armedDelete.value = null;
    return;
  }
  armedDelete.value = slotId;
}
</script>

<template>
  <section class="save-slots" aria-labelledby="save-slots-title">
    <header class="save-slots-head">
      <div>
        <span class="save-slots-kicker">LOCAL SAVE</span>
        <h2 id="save-slots-title">手动存档</h2>
      </div>
      <button type="button" class="save-slots-close" aria-label="关闭手动存档" @click="emit('close')">×</button>
    </header>
    <p class="save-slots-tip">三个手动槽独立于“继续上局”；终局清理自动槽时不会删除这里的存档。</p>
    <p v-if="notice" class="save-slots-notice" role="status">{{ notice }}</p>

    <div class="save-slot-grid">
      <article v-for="slot in slots" :key="slot.id" class="save-slot" :class="{ empty: !slot.exists }">
        <div class="save-slot-head">
          <strong>槽位 {{ slot.id }}</strong>
          <span :class="['save-slot-state', { saved: slot.exists }]">{{ slot.exists ? '已有存档' : '空槽' }}</span>
        </div>

        <template v-if="slot.exists">
          <dl class="save-slot-meta">
            <div><dt>种子</dt><dd>{{ slot.seed }}</dd></div>
            <div><dt>进度</dt><dd>第 {{ slot.turns ?? '?' }} 回合</dd></div>
            <div><dt>视角</dt><dd>{{ slot.spectate ? '5 AI 观战' : `座次 ${slot.humanId ?? '?'}` }}</dd></div>
            <div><dt>时间</dt><dd>{{ formatTime(slot.savedAt) }}</dd></div>
          </dl>
        </template>
        <p v-else class="save-slot-empty">可把当前对局保存到这里。</p>

        <div class="save-slot-actions">
          <button type="button" class="btn" @click="emit('save', slot.id)">
            {{ slot.exists ? '覆盖' : '保存' }}
          </button>
          <button
            v-if="slot.exists"
            type="button"
            class="btn ghost"
            @click="emit('load', slot.id)"
          >读取</button>
          <button
            v-if="slot.exists"
            type="button"
            class="btn ghost save-slot-delete"
            :class="{ armed: armedDelete === slot.id }"
            @click="requestDelete(slot.id)"
          >{{ armedDelete === slot.id ? '确认删除' : '删除' }}</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.save-slots {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background:
    linear-gradient(120deg, rgb(217 181 111 / 7%), transparent 36%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}
.save-slots-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.save-slots-kicker {
  display: block;
  margin-bottom: 2px;
  color: #75694f;
  font: 700 8px/1.2 Georgia, serif;
  letter-spacing: 0.2em;
}
.save-slots h2 {
  margin: 0;
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 18px;
  letter-spacing: 0.06em;
}
.save-slots-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #3b4850;
  border-radius: 7px;
  background: rgb(0 0 0 / 14%);
  color: #a7b2b8;
  font-size: 18px;
  cursor: pointer;
}
.save-slots-tip {
  margin: 8px 0 10px;
  color: #829097;
  font-size: 11px;
  line-height: 1.55;
}
.save-slots-notice {
  margin: 0 0 10px;
  padding: 7px 9px;
  border-left: 2px solid var(--gold);
  background: rgb(217 181 111 / 7%);
  color: #cfbd93;
  font-size: 11px;
}
.save-slot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.save-slot {
  display: flex;
  min-width: 0;
  min-height: 184px;
  flex-direction: column;
  padding: 10px;
  border: 1px solid #354149;
  border-radius: 10px;
  background: rgb(0 0 0 / 12%);
}
.save-slot.empty {
  border-style: dashed;
  background: rgb(0 0 0 / 7%);
}
.save-slot-head,
.save-slot-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}
.save-slot-head {
  justify-content: space-between;
  padding-bottom: 7px;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
  color: #e2d2ad;
  font-size: 12px;
}
.save-slot-state {
  color: #6f7c83;
  font-size: 9px;
}
.save-slot-state.saved {
  color: #78c58f;
}
.save-slot-meta {
  display: grid;
  gap: 4px;
  margin: 8px 0 10px;
}
.save-slot-meta div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.save-slot-meta dt {
  color: #6f7d84;
  font-size: 9px;
}
.save-slot-meta dd {
  overflow: hidden;
  color: #b9c3c7;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.save-slot-empty {
  flex: 1;
  margin: 12px 0;
  color: #64737a;
  font-size: 10px;
  line-height: 1.55;
}
.save-slot-actions {
  margin-top: auto;
  flex-wrap: wrap;
}
.save-slot-actions .btn {
  min-height: 30px;
  flex: 1 1 auto;
  padding: 4px 7px;
  font-size: 10px;
}
.save-slot-delete.armed {
  border-color: #9d4a4a;
  background: #6f2e2e;
  color: #ffe1dc;
}
@media (max-width: 900px) {
  .save-slot-grid {
    grid-template-columns: 1fr;
  }
  .save-slot {
    min-height: 0;
  }
  .save-slot-actions .btn {
    min-height: 44px;
  }
}
</style>
