// e2e 共享工具：起 preview 服务器、解析 ?debug 面板、自动应答真人询问。
// 设计约束（ADR-0027）：黑盒 HTTP 级探测，不 import src/**，不依赖 tests/**。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const BASE_PATH = '/sanguosha-solo/'; // 与 vite.config.ts 的 base 一致
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 端口是否可绑定（无监听者）。 */
export const portFree = (p) =>
  new Promise((res) => {
    const srv = net.createServer();
    srv.once('error', () => res(false));
    srv.once('listening', () => srv.close(() => res(true)));
    srv.listen(p, '127.0.0.1');
  });

/** 从 start 起找第一个空闲端口（被占时「换端口」策略，见 ADR-0027）；找不到则抛错。 */
export async function findFreePort(start = E2E_PORT, tries = 10) {
  for (let p = start; p < start + tries; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`端口 ${start}~${start + tries - 1} 均被占用，无法起 preview`);
}

const require = createRequire(import.meta.url);

/** 解析 playwright-core：优先项目 node_modules（npm i --no-save playwright-core），其次 e2e/node_modules。 */
export function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch {
    throw new Error(
      '未找到 playwright-core。请在仓库根目录执行：npm i --no-save playwright-core\n' +
        '（--no-save 不会写进 package.json；浏览器缓存见 e2e/README.md）',
    );
  }
}

/** 在 playwright 浏览器缓存里兜底找一个 chromium 可执行文件（版本号不匹配时用）。 */
export function findChromiumExecutable() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), '.cache', 'ms-playwright'), // Linux
    join(homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium')) continue; // chromium-1234 / chromium_headless_shell-1234
      for (const sub of [
        'chrome-linux/chrome',
        'chrome-linux64/chrome',
        'chrome-linux/headless_shell',
        'chrome-headless-shell-linux64/chrome-headless-shell', // 新版 headless shell 布局
      ]) {
        const exe = join(root, dir, sub);
        if (existsSync(exe)) candidates.push(exe);
      }
    }
  }
  // 取版本号最大的（数字比较，别用字典序：1148 > 1000 但字典序会排反）
  const ver = (p) => Number(p.match(/-(\d+)\//)?.[1] ?? 0);
  candidates.sort((a, b) => ver(a) - ver(b) || a.localeCompare(b));
  return candidates.at(-1) ?? null;
}

/** 启动 chromium：优先用 playwright-core 自带的版本解析，失败则回退到缓存里任意 chromium。 */
export async function launchBrowser(pw) {
  try {
    return await pw.chromium.launch();
  } catch (err) {
    const exe = findChromiumExecutable();
    if (!exe) throw err;
    console.log(`[e2e] 内置浏览器缺失，回退到缓存 chromium: ${exe}`);
    return pw.chromium.launch({ executablePath: exe });
  }
}

/**
 * 起 vite preview（先构建，除非 E2E_SKIP_BUILD=1）。返回 { baseUrl, stop }。
 * - 端口：E2E_PORT 覆盖，默认 4173（--strictPort，被占用即报错）
 * - E2E_BASE_URL 指定时完全不本地起服（连远程/已有实例用）
 * - stop() 终止子进程；进程退出时兜底清理
 */
export async function startPreview({ build = true } = {}) {
  if (process.env.E2E_BASE_URL) {
    const baseUrl = process.env.E2E_BASE_URL.replace(/\/$/, '');
    console.log(`[e2e] 使用外部服务器: ${baseUrl}`);
    return { baseUrl, stop: () => {} };
  }
  if (build && process.env.E2E_SKIP_BUILD !== '1') {
    console.log('[e2e] 构建（E2E_SKIP_BUILD=1 可跳过）...');
    const r = spawn('npm', ['run', 'build'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    let out = '';
    r.stdout.on('data', (d) => (out += d));
    r.stderr.on('data', (d) => (out += d));
    const code = await new Promise((res) => r.on('close', res));
    if (code !== 0) {
      console.error(out.slice(-3000));
      throw new Error(`vite build 失败（exit ${code}）`);
    }
  }
  // 端口在调用时读取（而非模块加载时）：脚本可先 findFreePort 再写回 process.env.E2E_PORT
  const port = Number(process.env.E2E_PORT ?? E2E_PORT);
  const child = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    detached: true, // 独立进程组，kill(-pid) 连带清理
  });
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* 已退出 */
    }
  };
  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, stop);
  const baseUrl = `http://localhost:${port}${BASE_PATH}`;
  // 等服务就绪（最多 15s）
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) {
        console.log(`[e2e] preview 就绪: ${baseUrl}`);
        return { baseUrl, stop };
      }
    } catch {
      /* 未就绪 */
    }
    await sleep(300);
  }
  stop();
  throw new Error(`preview 在 15s 内未就绪（端口 ${port}）`);
}

/** 收集页面错误（pageerror 一票否决；console.error 过滤 404 资源噪音） */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text().slice(0, 200));
  });
  return errors;
}

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** 解析 ?debug 面板：DEBUG humanId=N spectate=bool pend=kind@pid */
export async function readDebug(page) {
  const raw = await page.locator('.prompt').textContent().catch(() => '') || '';
  const t = norm(raw);
  const h = t.match(/humanId=(-?\d+)/);
  const p = t.match(/pend=([\w]+)@(-?\d+)/);
  return {
    raw: t,
    humanId: h ? Number(h[1]) : -9,
    pendKind: p ? p[1] : null,
    pendPid: p ? Number(p[2]) : -9,
    /** 对局已结束（winner=true，终局静止不算冻结） */
    get gameOver() {
      return /winner=true/.test(t);
    },
    /** pend 是否属于真人 */
    get mine() {
      return h && Number(h[1]) >= 0 && p && Number(p[2]) === Number(h[1]);
    },
  };
}

export const centerText = (page) =>
  page.locator('.center').textContent().then(norm).catch(() => '');

/**
 * 自动应答一切真人询问（返回是否做了动作）。
 * 判别原则（ADR-0027）：pend 属于真人 → 必须应答；不属于真人 → 仅在提示栏出现询问按钮时兜底点最后一个。
 * 策略：一般询问点最后一个按钮 = 放弃/不出/不发动（所有询问 UI 的末位按钮都是拒绝项）。
 */
export async function actHuman(page) {
  const d = await readDebug(page);
  const btns = page.locator('.prompt .btn');
  const btnCount = await btns.count().catch(() => 0);
  const clickLast = async () => {
    if ((await btns.count()) > 0) {
      await btns.nth((await btns.count()) - 1).click().catch(() => {});
      return true;
    }
    return false;
  };

  if (d.mine) {
    // 弃牌：点满 N 张手牌再确认
    if (d.pendKind === 'discard') {
      const need = Number((d.raw.match(/请弃置 (\d+) 张/) ?? [])[1] ?? 1);
      const cards = page.locator('.hand .card');
      const have = await cards.count();
      for (let k = 0; k < Math.min(need, have); k++) await cards.nth(k).click().catch(() => {});
      await sleep(200);
      return clickLast(); // 末位按钮 = 确认弃牌
    }
    // 出牌阶段：结束出牌（不在技能/选牌子模式时才存在）
    if (d.pendKind === 'play') {
      const end = page.getByText('结束出牌').first();
      if (await end.count()) {
        await end.click().catch(() => {});
        return true;
      }
      return clickLast(); // 子模式（制衡/离间等）的取消按钮
    }
    // 流离：点一张手牌 → 点一个可转移座次；无目标则点不发动
    if (d.pendKind === 'liuli') {
      const cards = page.locator('.hand .card');
      if ((await cards.count()) > 0) {
        await cards.first().click().catch(() => {});
        await sleep(300);
        const tgt = page.locator('.seat.targetable').first();
        if ((await tgt.count()) > 0) {
          await tgt.click().catch(() => {});
          return true;
        }
      }
      return clickLast(); // 不发动
    }
    // 其余一切询问（闪/杀/桃/无懈/五谷/借刀/观星/触发技…）：末位按钮都是放弃项
    return clickLast();
  }

  // pend 不属于真人：提示栏却带询问按钮（观战兜底/边角情况）→ 点最后一个
  if (/是否|你可以|请选择|请打出|打出|弃置|响应|使用|交出|给你/.test(d.raw)) return clickLast();
  return false;
}

/** 打开干净的一局：清 localStorage → 重载 → 关介绍 → 观战或按 seed 开局 */
export async function openGame(page, baseUrl, { seed = null } = {}) {
  await page.goto(`${baseUrl}/?debug`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  const intro = page.locator('.intro-btn');
  if (await intro.count()) await intro.first().click().catch(() => {});
  if (seed == null) {
    await page.getByText('观战（5 AI）').first().click();
  } else {
    await page.locator('input[type=number]').fill(String(seed));
    await page.getByText('按此种子开局').first().click();
  }
  await sleep(1200);
}
