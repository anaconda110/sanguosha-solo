#!/usr/bin/env node
// e2e 交互守护（ADR-0027）：固定 seed 真人局，验证 M20 的三个交互入口没有被后续重构弄坏。
//
//   ① 悬停手牌 → 出现 .card-tip（卡牌说明）
//   ② 点选手牌 → 出现 .hand .card.selected，且座次高亮（.seat.targetable / .seat.dimmed）
//   ③ 拖拽该牌（pointerdown → 分步 pointermove → pointerup）到 .seat.targetable → 手牌数 -1
//
// 前置：等到 ?debug 面板 pend=play@humanId（真人出牌阶段）。等待期间自动应答其他询问。
// 注意：点某些牌（装备/无中生有等）会立即打出并短暂离开出牌阶段，选牌循环对此自适应——
//       每轮尝试前重新等回 pend=play@humanId。
//
// 用法：node e2e/interaction.mjs
//   环境变量：E2E_PORT / E2E_SKIP_BUILD=1 / E2E_BASE_URL / E2E_SEED（默认 777）

const SEED = Number(process.env.E2E_SEED ?? 777);

async function main() {
  const problems = [];
  if (!process.env.E2E_BASE_URL) {
    const want = Number(process.env.E2E_PORT ?? 4173);
    const { findFreePort } = await import('./helpers.mjs');
    const port = await findFreePort(want);
    if (port !== want) console.log(`[e2e] 端口 ${want} 被占用，换用 ${port}`);
    process.env.E2E_PORT = String(port);
  }
  const {
    startPreview, loadPlaywright, launchBrowser, collectErrors,
    openGame, actHuman, readDebug, sleep,
  } = await import('./helpers.mjs');

  const { baseUrl, stop } = await startPreview();
  const pw = loadPlaywright();
  const browser = await launchBrowser(pw);
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = collectErrors(page);

    console.log(`\n[e2e] 真人局 seed=${SEED}，等待出牌阶段（pend=play@humanId）…`);
    await openGame(page, baseUrl, { seed: SEED });
    await waitPlayPhase(page, 90_000, { actHuman, readDebug, sleep });
    console.log('[e2e] ✓ 已进入真人出牌阶段');

    const cards = page.locator('.hand .card');

    // ---- ① 悬停出卡牌说明 ----
    let tipOk = false;
    const hoverTries = Math.min(3, await cards.count());
    for (let k = 0; k < hoverTries && !tipOk; k++) {
      await cards.nth(k).hover();
      await sleep(350);
      tipOk = (await page.locator('.card-tip').count()) > 0;
    }
    console.log(`[e2e] 悬停手牌 → .card-tip: ${tipOk ? '出现 ✓' : '未出现 ✗'}`);
    if (!tipOk) problems.push('悬停手牌未出现 .card-tip（悬停说明失效）');
    await page.mouse.move(10, 400); // 移开鼠标，收起 tip
    await sleep(200);

    // ---- ② 点选高亮：找到一张能选出目标的牌 ----
    let chosen = -1; // 点选后有 .seat.targetable 的牌（可拖拽出牌）
    let dimmedSeen = 0; // 点选后至少出现 .seat.dimmed 的证据
    const tryMax = Math.min(await cards.count(), 8);
    for (let k = 0; k < tryMax && chosen < 0; k++) {
      await waitPlayPhase(page, 45_000, { actHuman, readDebug, sleep }); // 上一次点击可能打出了装备牌
      const cur = page.locator('.hand .card');
      if (k >= (await cur.count())) break;
      await cur.nth(k).click();
      await sleep(350);
      const selectedNow = await page.locator('.hand .card.selected').count();
      const targetable = await page.locator('.seat.targetable').count();
      const dimmed = await page.locator('.seat.dimmed').count();
      if (selectedNow > 0 && targetable > 0) {
        chosen = k;
        dimmedSeen = dimmed;
        console.log(`[e2e] 点选第 ${k} 张手牌 → .selected=1, .seat.targetable=${targetable}, .seat.dimmed=${dimmed} ✓`);
        break;
      }
      if (selectedNow > 0 && dimmed > 0) {
        dimmedSeen = dimmed; // 记录高亮证据，但无目标可拖，继续找别的牌
        await cur.nth(k).click(); // 取消选择
        await sleep(250);
      }
      // selectedNow === 0：此牌本阶段不可主动使用（如闪），直接试下一张
    }
    if (chosen < 0 && dimmedSeen > 0) {
      problems.push(`点选手牌有 .seat.dimmed=${dimmedSeen} 但找不到一张能选出 .seat.targetable 的牌，无法继续拖拽验证`);
    } else if (chosen < 0) {
      problems.push('点选手牌后未出现 .hand .card.selected / .seat.targetable / .seat.dimmed（点选与目标高亮失效）');
    }

    // ---- ③ 拖拽出牌：拖拽后事件日志应出现「使用【…】」 ----
    // 判定不用"手牌数 -1"：杀命中反贼会奖励摸 3 张、连营/遗计等也会补牌，
    // 手牌数变化不唯一；日志出现新"使用【…】"才直接证明拖拽真的出了牌。
    // 只挑一次点击即结算的牌——排除借刀杀人（需二次点选持刀者）与方天画戟分支
    // （杀为最后手牌时需按「使用【杀】」确认），拖一次不会出牌，会误判。
    // 允许跨回合寻找：某一回合手牌里可能恰好没有可拖拽的牌，结束出牌等下一回合。
    const DRAGGABLE = ['杀', '过河拆桥', '顺手牵羊', '决斗', '乐不思蜀', '兵粮寸断'];
    let dragged = false;
    let dragNote = '';
    for (let turn = 0; turn < 4 && !dragged; turn++) {
      await waitPlayPhase(page, 90_000, { actHuman, readDebug, sleep });
      // 先清掉上一段点选循环留下的选择——再点同一张牌是"取消选择"（onCardClick 切换语义），
      // 不清会让下面的点击把选中态切走而误判"找不到可拖拽的牌"
      const stale = page.locator('.hand .card.selected');
      if (await stale.count()) { await stale.first().click().catch(() => {}); await sleep(250); }
      let dragIdx = -1;
      for (let k = 0; k < (await page.locator('.hand .card').count()) && dragIdx < 0; k++) {
        await waitPlayPhase(page, 90_000, { actHuman, readDebug, sleep });
        if ((await page.locator('.hand .card').count()) <= k) break;
        const name = ((await page.locator('.hand .card').nth(k).locator('.cname').textContent()) ?? '').trim();
        if (!DRAGGABLE.includes(name)) continue;
        await page.locator('.hand .card').nth(k).click();
        await sleep(350);
        if ((await page.locator('.hand .card.selected').count()) > 0 &&
            (await page.locator('.seat.targetable').count()) > 0) {
          dragIdx = k;
          break;
        }
        await page.locator('.hand .card').nth(k).click().catch(() => {}); // 取消选择
        await sleep(200);
      }
      const src = dragIdx >= 0 ? await page.locator('.hand .card').nth(dragIdx).boundingBox() : null;
      const tgt = await page.locator('.seat.targetable').first().boundingBox();
      if (!src || !tgt) {
        // 本回合没有可拖拽的牌：结束出牌，下一回合再找
        dragNote = `第 ${turn + 1} 个出牌阶段无「杀/过河拆桥/顺手牵羊/决斗」可用，已结束出牌转入下一回合`;
        console.log(`[e2e] ${dragNote}`);
        const endBtn = page.getByText('结束出牌').first();
        if (await endBtn.count()) await endBtn.click().catch(() => {});
        await sleep(800);
        continue;
      }
      const before = await page.locator('.hand .card').count();
      await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
      await page.mouse.down();
      await sleep(150);
      // >10px 才激活拖拽（useInteraction.cardDragMove），分步移动触发 pointermove
      await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 12 });
      await sleep(150);
      await page.mouse.up();
      await sleep(600); // 先抓拖拽刚提交、AI 尚未盖过日志的窗口
      // 战报面板只保留尾部窗口，不能数全量；读尾部若干条里有没有新"使用【…】"
      const evs = await page.locator('.log .logev').allTextContents();
      const usedSeen = evs.slice(-10).some(t => t.includes('使用【'));
      await sleep(1400);
      const after = await page.locator('.hand .card').count();
      console.log(`[e2e] 拖拽第 ${dragIdx} 张手牌至 .seat.targetable → 日志尾部出现"使用【…】": ${usedSeen ? '✓' : '✗'}（手牌 ${before} → ${after}）`);
      if (usedSeen) {
        dragged = true;
      } else {
        dragNote = '拖拽后日志尾部未出现新"使用【…】"';
        const endBtn = page.getByText('结束出牌').first();
        if (await endBtn.count()) await endBtn.click().catch(() => {});
        await sleep(800);
      }
    }
    if (!dragged) {
      problems.push(`4 个出牌阶段内未能验证拖拽出牌（最后原因：${dragNote || '无可拖拽的牌'}）`);
    }

    if (errors.length) problems.push(`页面错误 ${errors.length} 条:\n  ${errors.join('\n  ')}`);
    else console.log('[e2e] ✓ 无 pageerror / console.error');

    if (problems.length) {
      console.error(`\n✗ interaction 失败：\n- ${problems.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log('\n✓ interaction 全绿：悬停说明 / 点选高亮 / 拖拽出牌 均工作');
    }
  } finally {
    await browser.close().catch(() => {});
    stop();
  }
}

/** 等到真人出牌阶段；期间只应答非 play 询问（play 归属真人时返回，绝不吃掉出牌阶段）。 */
async function waitPlayPhase(page, timeoutMs, { actHuman, readDebug, sleep }) {
  const deadline = Date.now() + timeoutMs;
  let d = await readDebug(page);
  while (Date.now() < deadline) {
    d = await readDebug(page);
    if (d.mine && d.pendKind === 'play') return d;
    if (d.pendKind !== 'play') await actHuman(page); // 弃牌/流离/一般询问照常应答
    await sleep(600);
  }
  throw new Error(`${Math.round(timeoutMs / 1000)}s 内未等到 pend=play@humanId（最后状态: ${d.raw.slice(0, 120)}）`);
}

main().catch((e) => {
  console.error(`\n✗ interaction 异常退出：${e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : String(e)}`);
  process.exitCode = 1;
});
