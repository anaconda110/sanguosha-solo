// 战绩统计（M9→M22 自 App.vue 迁出）：规则 AI 自战批量对局的 UI 侧状态。
// 分批驱动：每局之间 setTimeout 让出主线程，面板实时刷新进度。
import { computed, ref } from 'vue';
import { GENERAL_INFO, type GeneralSub } from '../engine/types';
import { emptyBatch, runOneGame } from '../stats';

export function useStats() {
  const showStats = ref(false);
  const batchRunning = ref(false);
  const batchDone = ref(0);
  const batchTotal = ref(0);
  const batchAcc = ref(emptyBatch());

  const generalRows = computed(() =>
    Object.entries(batchAcc.value.generals)
      .map(([general, st]) => ({
        general,
        display: GENERAL_INFO[general as GeneralSub]?.display ?? general,
        games: st.games,
        wins: st.wins,
        rate: st.games > 0 ? ((st.wins / st.games) * 100).toFixed(0) : '0',
      }))
      .sort((a, b) => b.games - a.games || a.general.localeCompare(b.general)),
  );

  async function runBatch(n: number) {
    if (batchRunning.value) return;
    batchRunning.value = true;
    batchDone.value = 0;
    batchTotal.value = n;
    batchAcc.value = emptyBatch();
    const acc = batchAcc.value;
    for (let i = 0; i < n; i++) {
      runOneGame(1000 + i, acc);
      batchDone.value = i + 1;
      await new Promise(r => setTimeout(r, 0));
    }
    batchRunning.value = false;
  }

  return { showStats, batchRunning, batchDone, batchTotal, batchAcc, generalRows, runBatch };
}

export type StatsApi = ReturnType<typeof useStats>;
