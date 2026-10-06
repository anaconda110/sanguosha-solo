# 三国杀单机（sanguosha-solo）

从零手写的三国杀单机版（1 人类 + 4 AI，5 人身份局）：TypeScript + Vue 3 + Vite，
纯浏览器运行，零游戏框架——引擎、AI、界面全部自己实现，用于学习卡牌游戏的
状态机 / 结算 / AI 设计。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 构建产物到 dist/
npm run typecheck  # tsc --noEmit
npm run smoke      # 120 局规则 AI 自战回归（卡牌守恒 + 确定性校验）
```

## 当前内容

- **引擎**（`src/engine/`）：`step(state, action) → new state` 纯函数推进；结算帧栈
  （锦囊/杀/延时判定）；触发技队列；鬼才判定链；seed + 动作日志全量可回放。
- **14 名武将、四类技能**（`docs/adr/0010`~`0014`）：用牌转换（武圣/龙胆/倾国/国色/
  奇袭）、触发技（奸雄/反馈/鬼才/枭姬/洛神/流离/闭月）、主动技（苦肉/离间/观星）、
  锁定技（咆哮/无双/空城）；8 件武器特效 + 八卦阵 + 锦囊转换层。
- **AI**（`src/ai/`）：规则型优先级表 AI；首考出牌决策走 PIMC 蒙特卡洛（Web Worker
  中仿真，15s 看门狗兜底）。
- **界面**（`src/App.vue`）：环形桌位、卡牌角标、指向箭头、判定/伤害动画、观星
  选牌、武将图鉴、战绩统计面板（批量 AI 自战胜率）。

## 文档

- [CONTEXT.md](CONTEXT.md) — 领域术语表（结算栈/时序点/确定性化/选牌……）
- [docs/adr/](docs/adr/) — 15 篇架构决策记录（ADR-0001~0015），每篇含"已知简化"

## 测试

- `npm run smoke` — 多局 AI 自战：正常终局、卡牌守恒、同 seed 完全可复现
- `scripts/probe-m4.ts` — 技能/装备激活次数探针（`npx tsx scripts/probe-m4.ts 60`）
- `scripts/smoke-mc.ts` — MC AI 确定性校验
- `scripts/debug-one.ts` — 单局全日志调试

## 许可

仅供学习交流。三国杀相关名称版权归原权利方所有。
