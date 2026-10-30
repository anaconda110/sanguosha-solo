# 三国杀单机（sanguosha-solo）

从零手写的三国杀单机版（1 人类 + 4 AI，5 人身份局）：TypeScript + Vue 3 + Vite，
同时提供 Web 版与 Tauri 2 Windows 桌面版，零游戏框架——引擎、AI、界面全部自己实现，
用于学习卡牌游戏的状态机 / 结算 / AI 设计。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 构建产物到 dist/
npm run typecheck  # tsc --noEmit
npm run smoke      # 120 局规则 AI 自战回归（卡牌守恒 + 确定性校验）
npm run regression # 逐技回归护栏（40 技能覆盖 + 无懈链 + 构造局面）
npm run desktop:dev  # Tauri 桌面开发模式（Windows 需 Rust + MSVC + WebView2）
npm run package:win # Windows NSIS/MSI 安装包（需在 Windows 构建）
```

## Windows 安装包

桌面壳使用 Tauri 2，直接复用 Vite 的 `dist/`：

- `npm run build:desktop`：以相对资源路径构建桌面前端，不影响 GitHub Pages。
- `npm run package:win`：生成 NSIS `setup.exe` 与 MSI，产物位于
  `src-tauri/target/release/bundle/`。
- 本地 Windows 构建需要 Rust stable、Visual Studio C++ Build Tools 和 WebView2；
  仓库的 CI 在 `windows-latest` 上自动提供这些环境。

发布时推送与 `package.json` 版本一致的标签，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

`Desktop Release` 工作流会构建两种安装包、上传 Actions artifact，并创建待人工检查的
GitHub 草稿 Release。也可以在 Actions 页面手动触发构建。当前安装包未做 Authenticode
签名，Windows SmartScreen 会显示“未知发布者”。

## 当前内容

- **引擎**（`src/engine/`）：`step(state, action) → new state` 纯函数推进；结算帧栈
  （锦囊/杀/延时判定）；触发技队列；鬼才判定链；seed + 动作日志全量可回放。
- **25 名武将、五类技能**（`docs/adr/0010`~`0022`）：用牌转换（武圣/龙胆/倾国/国色/
  奇袭/急救）、触发技（奸雄/反馈/鬼才/枭姬/洛神/流离/闭月/铁骑/刚烈/突袭/裸衣/
  天妒/遗计/集智/连营）、主动技（苦肉/离间/观星/制衡/仁德/青囊/反间/结姻）、
  锁定技（咆哮/无双/空城/英姿/马术/奇才/谦逊/克己）、主公技（护驾/激将/救援，
  仅主公位），势力维度随主公技引入；**标准版 25 将齐备**；8 件武器特效 + 八卦阵
  + 锦囊转换层；体力上限按标准版 3/4 血表（主公位 +1）。
- **无懈链**（ADR-0017）：无懈可被反无懈，奇数张抵消、偶数张恢复；无中生有与
  桃园结义也逐目标询问无懈。
- **锦囊齐备**（ADR-0019）：标准版两型缺失锦囊已补齐——五谷丰登（亮牌逐目标
  挑选）与借刀杀人（转委托出杀，武器为筹码）；牌堆 117 张。
- **AI**（`src/ai/`）：规则型优先级表 AI；首考出牌决策走 PIMC 蒙特卡洛（Web Worker
  中仿真，15s 看门狗兜底）；**身份推断**（ADR-0018）从公开日志的行为打分推出
  敌/友/未知三态，用于目标排序与救援取舍（不读牌、纯函数、可复现）。
- **界面**（`src/App.vue`）：环形桌位、卡牌角标、指向箭头、判定/伤害动画、观星
  选牌、武将图鉴、战绩统计面板（批量 AI 自战胜率）；**三槽手动存档 + 独立自动续局槽**
  （localStorage 配额容错，旧档不因写入失败损坏）、**观战模式**（5 AI 自战）、
  种子输入（指定 seed 复现）、回放拖动跳转与事件定位（ADR-0021）、**新手引导**
  （首次进入五条要点，ADR-0023）。
- **交互优化**：手牌可操作性与不可用原因提示、技能托盘、目标座次高亮/置灰、悬停
  详情、真实拖拽出牌；目标态使用浮动手牌托盘，移动端提供底部操作坞，避免遮住牌桌。
- **确定性复盘报告**（ADR-0028）：终局后从 seed + 完整动作日志重演，生成身份全貌、
  玩家统计、技能/能力触发与关键时间线；独立质检通过后才可预览、复制或下载 Markdown，
  同一输入逐字节稳定。
- **发布闭环**（ADR-0023 / ADR-0029）：GitHub Actions CI（push/PR 自动跑
  typecheck + smoke + regression + build）、GitHub Pages 自动部署
  （`https://anaconda110.github.io/sanguosha-solo/`），以及 Windows NSIS/MSI
  桌面安装包构建与草稿 Release。
- **体验件**（ADR-0024）：**AI 难度分级**（简单=规则表 / 普通=蒙特卡洛）、
  程序合成音效（WebAudio 零素材）、设置面板（音效/音量/动画节奏，存本地）。

## 文档

- [CONTEXT.md](CONTEXT.md) — 领域术语表（结算栈/时序点/确定性化/选牌……）
- [docs/adr/](docs/adr/) — 29 篇架构决策记录（ADR-0001~0029），每篇含"已知简化"

## 测试

- `npm test` — 12 个 vitest 文件 / 94 个纯模块用例（引擎、视图、交互、三槽存档、
  回放定位、复盘报告契约）
- `npm run smoke` — 多局 AI 自战：正常终局、卡牌守恒、同 seed 完全可复现
- `npm run regression` — 逐技回归：40 项技能全覆盖（34 项自战断言 + 6 项构造局面）、
  无懈链奇偶、23 项构造局面
- `npm run e2e:interaction` — 浏览器交互 E2E：悬停说明、点选高亮、拖拽出牌，并守护
  页面异常与 console error
- `npm run e2e:guard` — 长时间运行冻结守护：检测真冻结、页面错误与性能异常
- `scripts/probe-m4.ts` — 技能/装备激活次数探针（`npx tsx scripts/probe-m4.ts 60`）
- `scripts/probe-belief.ts` — 身份推断准确率（命中/误判/弃权三档）
- `scripts/probe-friendly.ts` — 同阵营互伤统计（身份推断的效果观测）
- `scripts/smoke-mc.ts` — MC AI 确定性校验
- `scripts/debug-one.ts` — 单局全日志调试

## 许可

仅供学习交流。三国杀相关名称版权归原权利方所有。
