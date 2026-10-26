<script setup lang="ts">
// M24 复盘报告入口：按需触发纯函数重演，避免终局瞬间阻塞画面。
// 浏览器能力只留在本组件：预览、复制、下载 Markdown；报告本身不依赖 DOM。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import type { Action } from '../engine/types';
import { useModalA11y } from '../composables/useModalA11y';
import { buildReviewHighlights, createReplayArtifact, type ReplayArtifact } from '../review';

const props = defineProps<{
  seed: number;
  humanId: number;
  spectate: boolean;
  actionLog: Action[];
}>();

const open = ref(false);
const loading = ref(false);
const artifact = shallowRef<ReplayArtifact | null>(null);
const copyLabel = ref('复制 Markdown');
const highlights = computed(() =>
  artifact.value?.report ? buildReviewHighlights(artifact.value.report) : [],
);
const modalRef = ref<HTMLElement | null>(null);
const closeRef = ref<HTMLElement | null>(null);
let copyTimer: number | null = null;

async function openReport() {
  open.value = true;
  if (artifact.value || loading.value) return;
  loading.value = true;
  // 先让遮罩完成一次绘制，再执行两次确定性重演（构建 + 独立质检）。
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  artifact.value = createReplayArtifact({
    seed: props.seed,
    humanId: props.spectate ? null : props.humanId,
    spectate: props.spectate,
    actionLog: props.actionLog,
  });
  loading.value = false;
}

function closeReport() {
  open.value = false;
}

useModalA11y({
  open,
  modal: modalRef,
  initialFocus: closeRef,
  onClose: closeReport,
});

function scheduleCopyReset() {
  if (copyTimer != null) window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copyLabel.value = '复制 Markdown';
    copyTimer = null;
  }, 1600);
}

onBeforeUnmount(() => {
  if (copyTimer != null) window.clearTimeout(copyTimer);
});

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  return ok;
}

async function copyMarkdown() {
  const markdown = artifact.value?.markdown;
  if (!markdown) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(markdown);
    else if (!fallbackCopy(markdown)) throw new Error('浏览器不支持复制');
    copyLabel.value = '已复制';
    scheduleCopyReset();
  } catch {
    copyLabel.value = fallbackCopy(markdown) ? '已复制' : '复制失败';
    scheduleCopyReset();
  }
}

function downloadMarkdown() {
  const markdown = artifact.value?.markdown;
  if (!markdown) return;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sanguosha-replay-${props.seed}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="report-entry">
    <button class="btn ghost report-open" @click="openReport">📋 查看复盘报告</button>
  </div>

  <Teleport to="body">
    <div v-if="open" class="report-backdrop" @click.self="closeReport">
      <section ref="modalRef" class="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1">
        <header class="report-head">
          <div>
            <h2 id="report-title">对局复盘</h2>
            <p>seed {{ seed }} · 确定性重演 + 独立质检</p>
          </div>
          <button ref="closeRef" class="report-close" aria-label="关闭复盘报告" @click="closeReport">×</button>
        </header>

        <div v-if="loading" class="report-loading">
          <span class="report-spinner" />
          正在重演整局并核对报告…
        </div>

        <template v-else-if="artifact">
          <div class="quality" :class="artifact.quality.passed ? 'quality-pass' : 'quality-fail'">
            <strong>{{ artifact.quality.passed ? '✓ 质检通过' : '✕ 质检未通过' }}</strong>
            <span>{{ artifact.quality.checks.length }} 项检查</span>
          </div>

          <div class="checks">
            <div
              v-for="check in artifact.quality.checks"
              :key="check.id"
              class="check"
              :class="{ failed: !check.passed }"
            >
              <span>{{ check.passed ? '✓' : '✕' }}</span>
              <span class="check-label">{{ check.label }}</span>
              <span class="check-detail">{{ check.detail }}</span>
            </div>
          </div>

          <div v-if="artifact.quality.warnings.length" class="warnings">
            <p v-for="warning in artifact.quality.warnings" :key="warning">提示：{{ warning }}</p>
          </div>

          <section v-if="highlights.length" class="report-highlights" aria-labelledby="report-highlights-title">
            <h3 id="report-highlights-title">复盘亮点</h3>
            <div class="report-highlight-grid">
              <article v-for="highlight in highlights" :key="highlight.id" class="report-highlight">
                <span>{{ highlight.label }}</span>
                <p>{{ highlight.text }}</p>
                <small v-if="highlight.seq != null">事件 #{{ highlight.seq }}</small>
              </article>
            </div>
          </section>

          <pre v-if="artifact.markdown" class="markdown-preview">{{ artifact.markdown }}</pre>
          <p v-else class="blocked">质检存在错误，Markdown 交付已阻止。请保留 seed 与动作日志用于排查。</p>

          <footer class="report-actions">
            <button class="btn" :disabled="!artifact.markdown" @click="copyMarkdown">{{ copyLabel }}</button>
            <button class="btn ghost" :disabled="!artifact.markdown" @click="downloadMarkdown">下载 .md</button>
            <button class="btn ghost" @click="closeReport">关闭</button>
          </footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.report-highlights {
  padding: 10px;
  border: 1px solid rgb(217 181 111 / 18%);
  border-radius: 10px;
  background: rgb(217 181 111 / 4%);
}
.report-highlights h3 {
  margin: 0 0 7px;
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 14px;
  letter-spacing: 0.06em;
}
.report-highlight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.report-highlight {
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid #344149;
  border-radius: 7px;
  background: rgb(0 0 0 / 12%);
}
.report-highlight > span {
  color: #8e7952;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.report-highlight p {
  margin: 3px 0 0;
  color: #bcc6c8;
  font-size: 10px;
  line-height: 1.55;
}
.report-highlight small {
  display: block;
  margin-top: 3px;
  color: #5f6d73;
  font: 8px/1.2 'Cascadia Mono', Consolas, monospace;
}
.report-entry {
  display: flex;
  justify-content: flex-end;
  margin: 0;
}
.report-open {
  font-size: 13px;
}
.report-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    radial-gradient(circle at 50% 25%, rgb(217 181 111 / 8%), transparent 38%),
    rgb(4 8 10 / 82%);
  backdrop-filter: blur(5px);
}
.report-modal {
  width: min(920px, 100%);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border: 1px solid rgb(217 181 111 / 34%);
  border-radius: 16px;
  background:
    radial-gradient(circle at 8% 0%, rgb(217 181 111 / 10%), transparent 31%),
    linear-gradient(145deg, #18201f, #12191d 62%, #151b20);
  box-shadow: 0 28px 90px rgb(0 0 0 / 65%), inset 0 1px rgb(255 255 255 / 4%);
}
.report-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.report-head h2 {
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 22px;
  letter-spacing: 0.08em;
}
.report-head p {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.report-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgb(0 0 0 / 14%);
  color: #aeb9be;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 130ms ease, color 130ms ease, background 130ms ease;
}
.report-close:hover {
  border-color: var(--gold-dim);
  background: rgb(217 181 111 / 8%);
  color: var(--gold-bright);
}
.report-loading {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
}
.report-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.quality {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  font-size: 13px;
}
.quality-pass {
  border-color: rgb(98 180 122 / 28%);
  background: rgb(30 77 43 / 48%);
  color: #b8f0c8;
}
.quality-fail {
  border-color: rgb(184 76 76 / 34%);
  background: rgb(92 31 31 / 55%);
  color: #ffc4c4;
}
.checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  max-height: 130px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--muted);
  scrollbar-color: #3a474f transparent;
  scrollbar-width: thin;
}
.check {
  display: grid;
  grid-template-columns: 14px auto minmax(0, 1fr);
  gap: 5px;
  align-items: baseline;
}
.check > span:first-child {
  color: #70d58f;
}
.check.failed > span:first-child,
.check.failed .check-label {
  color: #ff7777;
}
.check-label {
  color: #c8d0d1;
}
.check-detail {
  overflow: hidden;
  color: #748187;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warnings {
  padding: 8px 11px;
  border-left: 3px solid var(--gold);
  background: rgb(217 181 111 / 8%);
  color: #d9c58b;
  font-size: 12px;
}
.markdown-preview {
  min-height: 180px;
  max-height: 48vh;
  overflow: auto;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--line-soft);
  border-radius: 9px;
  background: #0e1518;
  color: #c9d0cd;
  font-family: 'Cascadia Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-color: #3a474f transparent;
  scrollbar-width: thin;
}
.blocked {
  padding: 26px;
  border: 1px dashed rgb(184 76 76 / 58%);
  border-radius: 8px;
  background: rgb(92 31 31 / 22%);
  color: #ffadad;
  text-align: center;
}
.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
@media (max-width: 680px) {
  .report-highlight-grid {
    grid-template-columns: 1fr;
  }
  .checks {
    grid-template-columns: 1fr;
  }
  .report-backdrop {
    padding: 8px;
  }
  .report-modal {
    max-height: calc(100vh - 16px);
    padding: 15px;
    border-radius: 13px;
  }
  .report-actions > .btn {
    flex: 1 1 100%;
  }
}
</style>
