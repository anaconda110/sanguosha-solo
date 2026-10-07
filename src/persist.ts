// 存档（M15）：把一局游戏的完整状态写入 localStorage，刷新页面后可续玩。
// 引擎是纯数据（ADR-0002），GameState 可直接 JSON 序列化——不需要任何自定义编码。
// 存的是"状态 + 动作日志"，因此续局与回放（ADR-0005 的 seed+重演）都能继续用。
import type { GameState } from './engine/types';

const KEY = 'sanguosha-solo:save';
const VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  seed: number;
  /** 人类玩家的座次；观战局无意义但保留（重放视角用） */
  humanId: number;
  spectate: boolean;
  state: GameState;
}

/** 读档；无存档或版本不符时返回 null（不抛异常，调用方无感） */
export function loadSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveFile;
    if (parsed.version !== VERSION || !parsed.state || !Array.isArray(parsed.state.players)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 存档；日志过大导致配额超限时，退化成"截断战报"再存一次。
 * 战报（log）只供界面显示与演出，动作日志（actionLog）才是回放/续局的依据——
 * 因此截断 log 不影响正确性，只丢历史文字。
 */
export function saveGame(file: Omit<SaveFile, 'version' | 'savedAt'>): void {
  const full: SaveFile = { version: VERSION, savedAt: Date.now(), ...file };
  try {
    localStorage.setItem(KEY, JSON.stringify(full));
    return;
  } catch {
    // 配额超限：只留最近 300 条战报（动作日志保完整）
  }
  try {
    const trimmed: SaveFile = {
      ...full,
      state: { ...full.state, log: full.state.log.slice(-300) },
    };
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // 仍然存不下：放弃本次存档（不影响对局）
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/** 存档是否存在（供"继续上局"按钮显隐；不解析内容） */
export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}
