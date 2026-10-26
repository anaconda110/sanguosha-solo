// 存档（M15）：把一局游戏的完整状态写入 localStorage，刷新页面后可续玩。
// 引擎是纯数据（ADR-0002），GameState 可直接 JSON 序列化——不需要任何自定义编码。
// 存的是"状态 + 动作日志"，因此续局与回放（ADR-0005 的 seed+重演）都能继续用。
import type { GameState } from './engine/types';

const KEY = 'sanguosha-solo:save';
const SLOT_PREFIX = 'sanguosha-solo:slot:';
const VERSION = 1;
export const SAVE_SLOT_IDS = ['1', '2', '3'] as const;

export interface SaveFile {
  version: number;
  savedAt: number;
  seed: number;
  /** 人类玩家的座次；观战局无意义但保留（重放视角用） */
  humanId: number;
  spectate: boolean;
  state: GameState;
}

export interface SaveSlotInfo {
  id: string;
  exists: boolean;
  savedAt: number | null;
  seed: number | null;
  humanId: number | null;
  spectate: boolean;
  turns: number | null;
}

function slotKey(slotId: string): string {
  return `${SLOT_PREFIX}${encodeURIComponent(slotId)}`;
}

function readSave(key: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveFile;
    if (parsed.version !== VERSION || !parsed.state || !Array.isArray(parsed.state.players)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写入指定键；配额超限时截断 log 后重试一次。返回是否成功。 */
function writeSave(key: string, file: Omit<SaveFile, 'version' | 'savedAt'>): boolean {
  const full: SaveFile = { version: VERSION, savedAt: Date.now(), ...file };
  try {
    localStorage.setItem(key, JSON.stringify(full));
    return true;
  } catch {
    // 配额超限：只留最近 300 条战报（动作日志保完整）
  }
  try {
    const trimmed: SaveFile = {
      ...full,
      state: { ...full.state, log: full.state.log.slice(-300) },
    };
    localStorage.setItem(key, JSON.stringify(trimmed));
    return true;
  } catch {
    // 仍然存不下：放弃本次存档（不影响对局）
    return false;
  }
}

/** 读档；无存档或版本不符时返回 null（不抛异常，调用方无感） */
export function loadSave(): SaveFile | null {
  return readSave(KEY);
}

/**
 * 存档；日志过大导致配额超限时，退化成"截断战报"再存一次。
 * 战报（log）只供界面显示与演出，动作日志（actionLog）才是回放/续局的依据——
 * 因此截断 log 不影响正确性，只丢历史文字。
 */
export function saveGame(file: Omit<SaveFile, 'version' | 'savedAt'>): void {
  writeSave(KEY, file);
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

// —— 三槽手动存档（M25）：完全独立于自动续局槽，终局清档不触碰手动槽 ——

export function loadSaveSlot(slotId: string): SaveFile | null {
  return readSave(slotKey(slotId));
}

/** 保存到指定手动槽；失败（配额/隐私模式）返回 false。 */
export function saveToSlot(slotId: string, file: Omit<SaveFile, 'version' | 'savedAt'>): boolean {
  return writeSave(slotKey(slotId), file);
}

export function hasSaveSlot(slotId: string): boolean {
  try {
    return localStorage.getItem(slotKey(slotId)) != null;
  } catch {
    return false;
  }
}

export function deleteSaveSlot(slotId: string): void {
  try {
    localStorage.removeItem(slotKey(slotId));
  } catch {
    /* 忽略 */
  }
}

/** 给存档菜单用的轻量摘要；坏数据表现为“空槽”，不会让菜单崩溃。 */
export function listSaveSlots(slotIds: readonly string[] = SAVE_SLOT_IDS): SaveSlotInfo[] {
  return slotIds.map(id => {
    const save = loadSaveSlot(id);
    return {
      id,
      exists: save != null,
      savedAt: save?.savedAt ?? null,
      seed: save?.seed ?? null,
      humanId: save?.humanId ?? null,
      spectate: save?.spectate ?? false,
      turns: save?.state.turnCount ?? null,
    };
  });
}
