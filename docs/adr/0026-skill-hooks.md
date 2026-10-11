# ADR-0026：技能即模块——step.ts 的钩子注册表

M16 把武将池封顶到标准版 25 人后，`step.ts` 长到 2000 行、67 个 case：
技能效果散落在 validate / apply / advance / dealDamage / stepSha / resolveJudge /
askNextTao 等十几处，每加一个武将都要横跨全文件插分支。本 ADR 记录 2026-10-12 的
重构决策：把技能实现搬成一技能一模块，step.ts 只留框架机械。

## 决策

**钩子注册表 + ops 注入。**

- `src/engine/skill-runtime.ts`：只含类型。`SkillHooks`（一个技能可实现的全部切入点，
  均可选）、`SkillOps`（step.ts 内部原语集）、`SkillCtx`（各调用点传给钩子的状态句柄）。
- `src/engine/skills/<skill>.ts`：一技能一文件，只 import `types` / `queries`（纯静态
  查询层）/ `rng`——对 step.ts **零依赖**，由 step.ts 在每次钩子调用时传入 `OPS`
  （dealDamage / hurt / drawCards / beginJudge / drawJudgeCard / queueTrigger /
  drawPhaseDefault / othersInOrder / seatDistance / hasAnyCard / askSkillPick /
  removeFromHand / shaHit / makeTrickFrame / reshuffleIfNeeded），杜绝循环引用。
- `src/engine/skills/index.ts`：汇总 `SKILL_HOOKS: Record<SkillSub, SkillHooks>` 与
  `PENDING_HOOKS`（技能自有询问 kind → 应答分派），并对 step.ts 暴露签名与迁移前
  一致的聚合函数（`skillOnDamaged` / `skillPreparePhase` / `skillSkipDiscard` 等）。
  step.ts 只 import 本文件。
- 原静态查询层 `skills.ts` 改名 `queries.ts`，**内容原样保留**（武圣/龙胆/倾国/
  国色/奇袭/空城/马术/咆哮/奇才/谦逊的换算、hasShaMaterial、asTrickSub）；
  skills/index.ts 整体再导出，`'../engine/skills'` 既有导入面（AI、回归脚本、测试）
  不变。

**这是一次行为保持重构**：对局结果与事件日志逐字节一致。迁移是纯代码搬移——
不改变任何 `s.log.push` 的内容与顺序、不改变 randU32/shuffle 的调用次数与顺序、
不改变状态字段（`damageBonus` 等保留）。

## 钩子切入点（最终清单）

| 切入点 | 触发位置 | 技能 |
| --- | --- | --- |
| `drawPhaseAsk` / `drawPhaseChoice` | advance 摸牌分支 + respondDraw | 突袭、裸衣 |
| `applyPending` | respondTuxi/respondYiji/respondGuanxing/respondLiuli/respondFanjian | 上列技能自有询问 |
| `drawCountBonus` | drawPhaseDefault | 英姿 |
| `onDamaged` | dealDamage 记账后 | 奸雄、反馈、遗计、刚烈 |
| `modifyShaDamage` | shaDamageAmount | 裸衣（经 damageBonus 字段） |
| `judgeWantsAsk` / `replaceJudgeCard` | stepJudge 询问链 + respondSkillCard | 鬼才 |
| `judgeCardGain` | resolveJudge 判定牌归属 | 天妒 |
| `onJudgeResolved` | resolveJudge 各 mode | 铁骑、刚烈、洛神 |
| `onTrigger` | respondTrigger 按子技能分派 | 奸雄、反馈、枭姬、洛神、遗计、连营 |
| `onEquipLost` | loseEquipTrigger | 枭姬 |
| `onTrickPlayed` | playTrick | 集智 |
| `onLastHandLost` | checkLianying（step() 首尾比对） | 连营 |
| `preparePhase` | advance 准备阶段 | 观星（询问）、洛神（入队） |
| `skipDiscard` | advance 弃牌阶段 | 克己 |
| `onTurnEnd` | endTurn | 闭月 |
| `onShaTargeted` / `modifyShaHit` | stepSha 目标询问与命中改写 | 流离、铁骑 |
| `validateActive` / `applyActive` | validate + apply 的 useSkill | 苦肉、制衡、仁德、青囊、反间、结姻、离间 |
| `canSaveTao` / `taoExtraHeal` | askNextTao + respondTao | 急救、救援 |

共迁移 **27 个技能模块**（救援/急救只含上述单点钩子；急救的红牌换算仍在 queries）。

**次序敏感点**（行为保持的关键，注册表声明序即遍历序）：

1. `DAMAGED_ORDER = [奸雄, 反馈, 遗计, 刚烈]`——遗计按伤害摸牌要消耗牌堆，
   必须发生在刚烈的判定摸牌之前（迁移前 dealDamage 的分支顺序）。
2. `preparePhase` 遍历中观星先于洛神（迁移前 advance 准备阶段的分支顺序）。
3. stepSha 中流离 → 铁骑判定 → 铁骑命中改写的先后（同一杀可能同时命中三者）。

## 留在框架层的机械（及理由）

- **主公技求援流程**（护驾/激将：aidCandidates / askLordFirst / askNextAid /
  respondLord）：三段式 pending 链与"代出牌者 ≠ 效果归属者"（aidForId）贯穿
  respondShan/respondSha 两大应答路径，与帧栈深度耦合；拆出去要么把整条应答路径
  一起搬走，要么把帧字段暴露给技能层——两者都比收益更贵。救援（jiuyuan）只取其
  桃的额外回复一点，已按钩子迁出。
- **无双**：needShan 与决斗双杀计数是 ShaFrame/TrickFrame 上的帧字段
  （needShan/shanPlayed/duelShaPlayed），属于应答协议本身而非独立时机。
- **装备/防具效果**（雌雄双股剑/青龙偃月刀/贯石斧/麒麟弓/青釭剑/八卦阵）：
  是装备不是武将技，语义上不属于技能注册表。
- **验证框架**：validate 的公共部分（目标合法性、距离、转换牌合法性）与各询问
  kind 的校验骨架——只有 useSkill 的分技能校验段随技能迁走。

## 验证协议

行为保持由四道护栏断言（全部在迁移前先取基线）：

1. `scripts/snapshot.ts`（新增）：seeds 1..24 规则 AI 自战到终局，对终局状态取
   sha256（winner + 全员 hp/手牌/装备/判定区 + 牌堆/弃牌堆长度 + 全量事件日志）。
   重构前后逐 seed 比对必须**逐字节全等**；脚本内置确定性自检（同一 seed 跑两遍）。
2. `npm run smoke`：120 局全终局 + seed 42 确定性。
3. `npm run regression`：40 局逐技计数全绿 + 构造局面断言（断言不许改，失败即漂移）。
4. `npx tsc --noEmit` + `npx vitest run`。

迁移分两波：波1（裸衣/遗计/天妒/克己/集智）先验证钩子骨架，波2 迁其余技能，
每波后全量跑一遍护栏。最终 snapshot 与基线逐字节一致、smoke/regression 全绿。

## 后果

- 新增武将 = 新增一个 `skills/<skill>.ts` + 在 `SKILL_HOOKS` 登记一行；不摸 step.ts。
- 技能模块只能拿到 ops 里暴露的原语；需要新原语 = 在 `SkillOps` 加一条签名
  （step.ts 已有对应函数，只是登记）。
- 多实现钩子点的次序由 index.ts 的声明序承载——**新增同钩子技能时必须复核
  DAMAGED_ORDER 与 preparePhase 的次序约束**。
- 代价：调用点比内联分支多一层间接（聚合函数遍历注册表）。自战吞吐无可见回退
  （smoke 120 局平均步数与迁移前一致），钩子遍历是每伤害/每回合一次的常数小循环。
- `tests/skills.test.ts` 等既有测试的 `engine/skills` 导入经 index.ts 再导出保持原样。
