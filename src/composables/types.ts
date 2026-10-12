// 组合根共享类型（M22）：各 composable 返回 API 的类型集中转发，
// 供组件 props 声明使用（避免组件直接依赖实现文件产生环）。
export type { GameApi } from './useGame';
export type { AnimationsApi } from './useAnimations';
export type { InteractionApi } from './useInteraction';
export type { SchedulerApi } from './useScheduler';
export type { SettingsApi } from './useSettings';
export type { StatsApi } from './useStats';
