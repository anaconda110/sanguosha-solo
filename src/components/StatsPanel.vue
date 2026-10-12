<script setup lang="ts">
// 战绩统计面板（M9，M22 自 App.vue 迁出）：批量规则 AI 自战的进度与胜率表。
// 批量状态与 runBatch 均来自 useStats（父级持有），此处只读展示并触发跑批。
import type { StatsApi } from '../composables/useStats';
import { SIDE_NAMES, SIDE_ORDER } from '../composables/labels';

const props = defineProps<{ stats: StatsApi }>();
// 解构复制的是 ref 本体（非取值），响应式不丢；模板自动解包
const { batchRunning, batchDone, batchTotal, batchAcc, generalRows, runBatch } = props.stats;
</script>

<template>
  <section class="codex stats-panel">
    <div class="stats-head">
      <b>战绩统计</b>
      <span v-if="batchRunning">模拟中… {{ batchDone }}/{{ batchTotal }} 局</span>
      <span v-else-if="batchAcc.games > 0">已完成 {{ batchAcc.games }} 局（seed 1000 起，可复现）</span>
      <span v-else>规则 AI 自战批量对局</span>
      <button class="btn" :disabled="batchRunning" @click="runBatch(20)">跑 20 局</button>
      <button class="btn" :disabled="batchRunning" @click="runBatch(100)">跑 100 局</button>
    </div>
    <template v-if="batchAcc.games > 0">
      <div class="stats-line">
        胜方：
        <span v-for="s in SIDE_ORDER" :key="s" class="stats-side">
          {{ SIDE_NAMES[s] }} {{ batchAcc.sideWins[s] ?? 0 }}（{{
            ((batchAcc.sideWins[s] ?? 0) / batchAcc.games * 100).toFixed(0)
          }}%）
        </span>
        ｜平均 {{ (batchAcc.stepsSum / batchAcc.games).toFixed(0) }} 步，最长 {{ batchAcc.maxSteps }} 步
      </div>
      <table class="stats-table">
        <thead>
          <tr><th>武将</th><th>出场</th><th>胜场</th><th>胜率</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in generalRows" :key="r.general">
            <td>{{ r.display }}</td>
            <td>{{ r.games }}</td>
            <td>{{ r.wins }}</td>
            <td>{{ r.rate }}%</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style>
.stats-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.stats-line {
  margin-top: 8px;
  font-size: 12px;
  color: #9aa3b2;
}
.stats-side {
  margin-right: 8px;
}
.stats-table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 12px;
}
.stats-table th,
.stats-table td {
  border-bottom: 1px solid #2a3040;
  padding: 3px 6px;
  text-align: left;
}
.stats-table th {
  color: #7a8494;
  font-weight: normal;
}
</style>
