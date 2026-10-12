#!/usr/bin/env node
// e2e 冻结守护（ADR-0027 核心资产）。自足 Node 脚本：构建 → 起 preview → 两阶段探测 → 清理。
//
//   阶段一（观战 40s）：5 AI 自战，纯观察。断言中央状态（.center 文本）去重数 > 15
//            ——AI 调度链活着必然持续换状态；静默断头（ADR-0025 三次事故）会让它很快静止。
//   阶段二（真人局 60s，固定 seed）：循环自动应答一切真人询问，断言
//            ① 无 ≥15s「真冻结」  ② 无 pageerror。
//
// 「真冻结」判别（与 e2e/README.md 方法论一致）：
//   - pend=kind@pid 属于真人（pid===humanId）且提示栏要求交互 → 正常等待，不算冻结；
//   - 其余情况（含 pend=null）中央状态+提示静止 ≥15s → 真冻结。
//     结算动画均为亚秒级演出（且 M20 起可点空白跳过），15s 阈值天然排除。
//
// 用法：node e2e/freeze-guard.mjs
//   环境变量：E2E_PORT（默认 4173，被占自动换下一个空闲端口）
//             E2E_SKIP_BUILD=1（复用已有 dist）/ E2E_BASE_URL（外接已起服务器）
//             E2E_SEED（真人局种子，默认 777）
//             E2E_SPECTATE_SECONDS / E2E_HUMAN_SECONDS（默认 40 / 60）

const SPECTATE_SECONDS = Number(process.env.E2E_SPECTATE_SECONDS ?? 40);
const HUMAN_SECONDS = Number(process.env.E2E_HUMAN_SECONDS ?? 60);
const SEED = Number(process.env.E2E_SEED ?? 777);
const FREEZE_TICKS = 15; // 1s 一拍；连续静止 ≥15 拍 = ≥15s

async function main() {
  const problems = [];
  // ---- 端口与共享工具（被占时换端口，不杀别人进程）----
  if (!process.env.E2E_BASE_URL) {
    const want = Number(process.env.E2E_PORT ?? 4173);
    const { findFreePort } = await import('./helpers.mjs');
    const port = await findFreePort(want);
    if (port !== want) console.log(`[e2e] 端口 ${want} 被占用，换用 ${port}`);
    process.env.E2E_PORT = String(port);
  }
  const {
    startPreview, loadPlaywright, launchBrowser, collectErrors,
    openGame, actHuman, readDebug, centerText, sleep,
  } = await import('./helpers.mjs');

  const { baseUrl, stop } = await startPreview();
  const pw = loadPlaywright();
  const browser = await launchBrowser(pw);
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = collectErrors(page);
    const promptText = () =>
      page.locator('.prompt').textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');

    // ================= 阶段一：观战 40s =================
    console.log(`\n[guard] 阶段一：观战 5 AI，观察 ${SPECTATE_SECONDS}s…`);
    await openGame(page, baseUrl); // 观战模式（随机 seed 即可，验证的是调度链活性）
    const states = new Set();
    for (let i = 0; i < SPECTATE_SECONDS; i++) {
      states.add(await centerText(page));
      await sleep(1000);
    }
    console.log(`[guard] 中央状态去重数: ${states.size}（要求 > 15）`);
    if (states.size <= 15) problems.push(`观战 ${SPECTATE_SECONDS}s 仅观察到 ${states.size} 种中央状态（≤15），疑似 AI 链断头`);

    // ================= 阶段二：真人局 60s =================
    console.log(`\n[guard] 阶段二：固定 seed=${SEED} 真人局，自动应答运行 ${HUMAN_SECONDS}s…`);
    await openGame(page, baseUrl, { seed: SEED });
    let prev = null, stuck = 0, maxStuck = 0;
    const freezes = [];
    for (let i = 0; i < HUMAN_SECONDS; i++) {
      const key = `${await centerText(page)}|${(await promptText()).slice(0, 50)}`;
      if (key === prev) {
        stuck++;
        // 连续静止达阈值：立刻判定是「等待真人」还是「真冻结」
        if (stuck === FREEZE_TICKS) {
          const d = await readDebug(page);
          const raw = await promptText();
          const btns = await page.locator('.prompt .btn').count();
          const hand = await page.locator('.hand .card').count();
          // 终局（winner=true）：静止是应有状态，不是冻结
          const legitWait = d.gameOver || (d.mine && (btns > 0 || hand > 0 || /是否|请|选择|弃置|打出|使用|响应|交出|结束/.test(raw)));
          console.log(`  [静止 ${stuck}s] pend=${d.pendKind}@${d.pendPid} humanId=${d.humanId} 按钮=${btns} 手牌=${hand} → ${d.gameOver ? '终局静止（正常）' : legitWait ? '等待真人（正常）' : '真冻结！'}`);
          if (!legitWait) freezes.push({ at: `${i}s`, pend: `${d.pendKind}@${d.pendPid}`, raw: raw.slice(0, 120) });
        }
        if (stuck > maxStuck) maxStuck = stuck;
      } else {
        stuck = 0;
      }
      prev = key;
      await actHuman(page); // 应答一切真人询问（弃牌/流离/出牌/一般询问）
      await sleep(1000);
    }

    console.log(`[guard] 最长静止: ${maxStuck}s（冻结阈值 ${FREEZE_TICKS}s）`);
    if (freezes.length) problems.push(`检出 ${freezes.length} 段 ≥15s 真冻结: ${JSON.stringify(freezes)}`);
    else console.log('[guard] ✓ 无 ≥15s 真冻结（长静止均为等待真人）');
    if (errors.length) problems.push(`页面错误 ${errors.length} 条:\n  ${errors.join('\n  ')}`);
    else console.log('[guard] ✓ 无 pageerror / console.error');

    if (problems.length) {
      console.error(`\n✗ freeze-guard 失败：\n- ${problems.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log(`\n✓ freeze-guard 全绿：观战 ${SPECTATE_SECONDS}s 去重 ${states.size}（>15）；真人局 seed=${SEED} 最长静止 ${maxStuck}s（<15s）；无页面错误`);
    }
  } finally {
    await browser.close().catch(() => {});
    stop(); // 杀掉 preview 进程组（helpers 里还挂了 exit/SIGINT/SIGTERM 兜底）
  }
}

main().catch((e) => {
  console.error(`\n✗ freeze-guard 异常退出：${e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : String(e)}`);
  process.exitCode = 1;
});
