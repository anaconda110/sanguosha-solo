// 设置 + 新手引导开关（M22 自 App.vue 迁出）：音效/音量/节奏/AI 难度与 intro 显隐。
// 注意：本模块必须在初始 `void scheduleAi()` 之前创建——scheduleAi 的 setTimeout
// 延时读取 settings.value.speed，settings 未初始化即调用是 M19 TDZ 冻结事故的根因之一。
import { ref } from 'vue';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { configureSound } from '../sound';

export function useSettings() {
  const settings = ref<Settings>(loadSettings());
  const showSettings = ref(false);
  /** 临时调试开关（?debug 或三击标题；M20 交互排查用） */
  const showDebug = ref(new URLSearchParams(location.search).has('debug'));

  function updateSettings(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch };
    saveSettings(settings.value);
    configureSound(settings.value.soundOn, settings.value.volume);
  }

  // —— 新手引导（M17）：首次进入显示，看过即存 localStorage 不再弹 ——
  const INTRO_KEY = 'sanguosha-solo:intro-seen';
  const showIntro = ref((() => {
    try {
      return localStorage.getItem(INTRO_KEY) == null;
    } catch {
      return true; // localStorage 不可用（如隐私模式）时每次都显示
    }
  })());

  function dismissIntro() {
    showIntro.value = false;
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* 忽略 */
    }
  }

  return { settings, showSettings, showDebug, updateSettings, showIntro, dismissIntro };
}

export type SettingsApi = ReturnType<typeof useSettings>;
