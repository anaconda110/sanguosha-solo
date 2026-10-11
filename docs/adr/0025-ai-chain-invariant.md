# AI 调度链不变量：任何静默 early-return 都是冻结点

M18–M20 期间"游戏卡死在某个 AI 行动阶段"反复出现三次，根因同类：`scheduleAi` 的 setTimeout 回调里存在提前 `return` 的路径（`!a`、异常被 try/catch 吞掉后不重调度、递归调用被编辑误删、初始调用被包进函数体内）。引擎纯函数测试（smoke/regression 全绿）完全无法覆盖这类 bug——它们只存在于演出/调度层。决定：约定两条不变量并写进代码注释——(1) `scheduleAi` 回调末尾必须无条件 `void scheduleAi()`（胜负/换局由 guard 提前退出）；(2) 初始调度必须位于 setup 顶层、settings 初始化之后。另附教训：模板引用的绑定必须定义在 `<script setup>` 顶层——M20 曾把交互块误插进 `updateSettings` 函数体，编译不报错但模板全部解析为 undefined。验证这类问题唯一可靠手段是 Playwright 浏览器实测（观察中央状态随时间变化 + `?debug` 面板读 pend），Node 侧探针判别"冻结"与"等待真人操作"需解析 `pend=kind@pid`。
