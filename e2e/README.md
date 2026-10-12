# e2e 守护测试（ADR-0027）

浏览器级黑盒守护：针对「AI 调度链静默断头」这类冻结 bug（三次事故，见
`docs/adr/0025-ai-chain-invariant.md`）。引擎纯函数测试（smoke / regression / vitest）
对这类 bug **全部绿**——故障只存在于演出/调度层，唯一可靠防线是浏览器实测。

## 本地运行

```bash
# 一次性准备：playwright-core 不进 package.json（--no-save），浏览器用 ~/.cache/ms-playwright 缓存
npm i --no-save playwright-core        # 仓库根目录
npx playwright-core install chromium   # 仅当缓存缺对应版本时需要（helpers 会自动兜底找缓存里任意 chromium）

npm run e2e:guard        # 冻结守护：观战 40s + 真人局 60s（自动构建 + 起 preview + 清理）
npm run e2e:interaction  # 交互守护：悬停说明 / 点选高亮 / 拖拽出牌（固定 seed）

# 或直接跑脚本（等价）：
node e2e/freeze-guard.mjs
node e2e/interaction.mjs
```

环境变量（两个脚本通用）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `E2E_PORT` | `4173` | preview 端口；**被占自动换下一个空闲端口**，不会杀别人的进程 |
| `E2E_SKIP_BUILD` | 未设置 | 设 `1` 跳过 `vite build`，复用已有 dist（连续跑两个脚本时第二个可加） |
| `E2E_BASE_URL` | 未设置 | 外接已起的服务器（如线上 Pages），此时完全不本地起服 |
| `E2E_SEED` | `777` | 真人局种子 |
| `E2E_SPECTATE_SECONDS` / `E2E_HUMAN_SECONDS` | `40` / `60` | 两阶段时长 |

脚本结束无论成败都会杀掉自己起的 preview 进程组；`Ctrl-C` 同样安全（helpers 挂了
exit/SIGINT/SIGTERM 兜底）。

## 为什么 e2e 不进 CI

见 `docs/adr/0027-e2e-guard.md`。一句话：CI 的 ubuntu runner 没有预装浏览器，
为 100 秒一次的守护测试引入 playwright + chromium 下载与沙箱依赖，换来的边际收益
低于让 CI 变慢变脆的代价——CI 已有 vitest 单测层（`unit-test` job）+ smoke/regression
兜住引擎纯函数层，e2e 守护定位为**发布前/重构后的本地手动关卡**。

## 核心方法论：「等待真人操作」与「真冻结」的判别

打开任意一局时给 URL 加 `?debug`，提示栏会渲染一行调试信息
（`src/App.vue` 的 prompt 区）：

```
DEBUG humanId=1 spectate=false pend=discard@1
```

- `humanId=N`：本局真人的 playerId（观战为 -1）。
- `pend=kind@pid`：引擎当前挂在玩家 `pid` 身上等 `kind` 类应答
  （`play`=出牌、`discard`=弃牌、`liuli`=流离、`null`=无人等待/结算中）。

### 判别规则

| 现象 | 判定 |
| --- | --- |
| `pend` **属于真人**（`pid === humanId`）且提示栏要求交互（弃牌选牌 / 流离转移 / 出牌阶段 / 一般询问按钮） | **正常等待**。引擎在等你点牌点按钮，不是 bug |
| `winner=true`（提示栏显示「对局结束」）后的静止 | **终局静止**。对局已结束，中央状态永远不变是应有状态 |
| `pend=null` 且中央状态（`.center` 文本）**静止超过 15 秒**且非结算动画 | **真冻结**。AI 链某处 early-return 断头，再也不会被调度 |
| `pend` 停在 **AI 头上** ≥15 秒 | **真冻结**。AI 应自动应答，绝不该等人 |

「非结算动画」由 15 秒阈值天然保证：结算演出全部是亚秒级（1.5s floatUp /
0.8s flash，且 M20 起点桌面空白可跳过），静止 15 秒的"动画"本身就是冻结。

### 两个脚本分别怎么用这套规则

- `freeze-guard.mjs` 阶段二每秒采样一次 `中央状态 + 提示栏前 50 字` 作为指纹，
  连续 15 拍相同即触发判定：读 `?debug` 的 pend，属于真人且有按钮/手牌/询问文案
  → 记为正常等待；否则记为一段真冻结并计入失败。阶段一（观战）不判冻结，只统计
  40 秒内中央状态的**去重数**——调度链活着必然持续换状态，>15 种才算通过。
- `interaction.mjs` 固定 seed 开真人局，等 `pend=play@humanId` 后依次验证三个
  交互入口：悬停手牌出 `.card-tip`、点选出 `.hand .card.selected` + 座次高亮
  （`.seat.targetable` / `.seat.dimmed`）、拖拽（pointerdown → 分步 pointermove →
  pointerup）到 `.seat.targetable` 后手牌数 -1。

### 调试技巧

- 复现冻结现场：`?debug` 面板的 pend 行 + `.center` 文本 + 日志面板最后一行，
  足以定位断头发生在哪个 kind 的询问（对照 ADR-0025 的四类根因）。
- 只想看某一局：`E2E_SEED=<种子> node e2e/freeze-guard.mjs`。
- 观战模式下真人不存在（`humanId=-1`），所有 pend 都属于 AI——这正是阶段一
  能「纯观察不断链」的原因。

## 文件

| 文件 | 职责 |
| --- | --- |
| `helpers.mjs` | 共享工具：起 preview（构建/端口/清理）、加载 playwright-core 与 chromium 兜底、解析 `?debug`、自动应答真人询问、开干净的一局 |
| `freeze-guard.mjs` | 冻结守护（本 README 主角，ADR-0027 核心资产） |
| `interaction.mjs` | 交互守护：悬停 / 点选 / 拖拽 |
