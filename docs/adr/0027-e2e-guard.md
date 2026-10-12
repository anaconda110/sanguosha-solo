# ADR-0027：e2e 守护测试——冻结类 bug 的唯一可靠防线，且不进 CI

M19 / M20 / M21 三次「AI 调度链静默断头」事故（见 ADR-0025）的排查结论一致：引擎纯函数层
（smoke 120 局自战、regression 逐技断言、M21d 起 40 条 vitest 用例）在这类 bug 面前**全绿**——
故障只存在于 `setTimeout` 调度、演出结算、UI 状态装配这些"组合层"，只有真实浏览器里
全部层叠在一起时才发病。排障利器是浏览器实测：给 URL 加 `?debug` 读
`humanId / pend=kind@pid`，再观察中央状态（`.center` 文本）是否随时间变化。
本 ADR 记录 2026-10-12 把这套临时探针固化成常驻守护（`e2e/freeze-guard.mjs`、
`e2e/interaction.mjs`，共享 `e2e/helpers.mjs`，方法论详见 `e2e/README.md`）的两个决策。

## 决策一：e2e 是这类 bug 的唯一可靠防线

冻结的本质是"某条调度链在某个分支静默 early-return，之后再无人被调度"。它不抛错、
不改引擎状态机语义、不影响已有断言——纯函数测试构造的是**已完成装配**的引擎，
而断头发生在**装配与续接**的缝隙里。浏览器实测之所以不可替代：

1. **观测点在链的末端**。`?debug` 的 `pend` 是调度器真实停留位置，中央状态文本是
   演出层真实心跳——两者静止即断头，无需理解内部实现。
2. **判别"真冻结"与"等待真人"可完全自动化**：`pend` 属于真人且提示栏要求交互 =
   正常等待；`pend=null`（或停在 AI 头上）且中央状态静止 ≥15 秒 = 真冻结
   （结算动画皆亚秒级，15 秒阈值天然排除动画）。`freeze-guard.mjs` 据此每秒采样、
   自动应答一切真人询问后连续跑 60 秒。
3. **不 import src/\*\*、不依赖 tests/\*\***——黑盒 HTTP 级探测，对被测代码零约束，
   不会随重构（如本次 M22 的 App.vue 组件化）而失效，只要 UI 契约
   （`.prompt`/`.center`/`.hand .card`/`.seat.targetable`/`?debug` 文案）不变。

## 决策二：e2e 不进 CI，作为本地手动关卡

`freeze-guard` + `interaction` 单次全绿约 3 分钟，但代价结构不适合 CI：

- **浏览器依赖**：ubuntu runner 无预装 chromium，需要 playwright 下载浏览器
  （约 170MB）或自建缓存/镜像；`playwright-core` 又必须 `--no-save` 安装
  （不进 package.json，见下），CI 里等于每次从零拉取，慢且增加网络抖动失败面。
- **收益错配**：CI 已有 `unit-test`（vitest）+ `test`（typecheck/smoke/regression/build）
  两层守住引擎与产物；e2e 防的是"重构把调度链/交互弄断"这类**发布前**风险，
  本地跑一次即可覆盖，不需要每个 PR 都付 100 秒浏览器成本。
- **稳定性**：守护测试含真实时间采样（40s/60s），共享 CI runner 时钟抖动会引入
  偶发红——让它保持"失败即真坏"的信号强度，胜过在 CI 里养一个 flaky job。

因此 CI 只加了一个 `unit-test` job（`npm ci` → `npm test`，与既有 `test` job 并行，
不动其结构）；e2e 守护通过 `npm run e2e:guard` / `npm run e2e:interaction` 本地运行，
运行方法与判别方法论写在 `e2e/README.md`。

## 附属约定

- **playwright-core 不进 package.json**：`npm i --no-save playwright-core` 装进
  node_modules 供 e2e 使用；`helpers.mjs` 优先用其自带版本解析，失败时按**版本号数字**
  从 `~/.cache/ms-playwright` 兜底挑最新 chromium（含 headless shell 新旧两种布局）。
  版本须与缓存的浏览器构建配对（曾因 pw-core 1.64 配 chromium-1148 出现
  locator 引擎失灵、页面看似空白），本地优先钉 `1.49.1`（与 chromium-1148 配对，
  三次事故排障时已验证）。
- **端口礼貌**：preview 端口默认 4173（`E2E_PORT` 覆盖），被占时**换下一个空闲端口**
  而非杀进程；脚本退出（含 Ctrl-C）总是杀掉自己起的 preview 进程组。
