// 设置（M18）：音效、动画节奏、AI 难度。存 localStorage，与存档分离——
// 这些是玩家偏好而非对局状态，换局仍应生效。
export interface Settings {
  /** 音效开关 */
  soundOn: boolean;
  /** 音量 0~1 */
  volume: number;
  /** 演出节奏倍率：1 = 原速，2 = 快进（作用于动画错峰与 AI 决策间隔） */
  speed: number;
  /** AI 难度：easy = 只用规则表；normal = 回合首个出牌决策走蒙特卡洛（ADR-0006） */
  difficulty: 'easy' | 'normal';
}

export const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  volume: 0.5,
  speed: 1,
  difficulty: 'normal',
};

const KEY = 'sanguosha-solo:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      soundOn: parsed.soundOn ?? DEFAULT_SETTINGS.soundOn,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      speed: parsed.speed === 1.5 || parsed.speed === 2 ? parsed.speed : DEFAULT_SETTINGS.speed,
      difficulty: parsed.difficulty === 'easy' ? 'easy' : 'normal',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 忽略：设置存不下只影响下次打开时的偏好恢复 */
  }
}
