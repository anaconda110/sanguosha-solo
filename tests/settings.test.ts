// settings.ts：玩家偏好存取（M18）——默认值、归一化、坏数据容错。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/settings';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    store: new Map<string, string>(),
    getItem(k: string) {
      return this.store.has(k) ? this.store.get(k)! : null;
    },
    setItem(k: string, v: string) {
      this.store.set(k, v);
    },
    removeItem(k: string) {
      this.store.delete(k);
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSettings', () => {
  it('无存档时返回默认值，且是副本（改返回值不污染 DEFAULT_SETTINGS）', () => {
    const s = loadSettings();
    expect(s).toEqual({ soundOn: true, volume: 0.5, speed: 1, difficulty: 'normal' });
    s.volume = 0.1;
    expect(DEFAULT_SETTINGS.volume).toBe(0.5);
    // 坏 JSON 同样回落默认值，不抛异常
    localStorage.setItem('sanguosha-solo:settings', '{broken');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('保存/加载往返一致', () => {
    saveSettings({ soundOn: false, volume: 0.8, speed: 2, difficulty: 'easy' });
    expect(loadSettings()).toEqual({ soundOn: false, volume: 0.8, speed: 2, difficulty: 'easy' });
  });

  it('volume 归一化到 [0,1]；非数值回落默认', () => {
    const write = (v: unknown) =>
      localStorage.setItem('sanguosha-solo:settings', JSON.stringify({ volume: v }));
    write(7);
    expect(loadSettings().volume).toBe(1);
    write(-3);
    expect(loadSettings().volume).toBe(0);
    write('loud');
    expect(loadSettings().volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('speed 只接受 1/1.5/2；difficulty 只接受 easy（否则回落 normal）', () => {
    const write = (v: object) =>
      localStorage.setItem('sanguosha-solo:settings', JSON.stringify(v));
    write({ speed: 1.5, difficulty: 'easy' });
    expect(loadSettings().speed).toBe(1.5);
    expect(loadSettings().difficulty).toBe('easy');
    write({ speed: 3, difficulty: 'lunatic' });
    expect(loadSettings().speed).toBe(DEFAULT_SETTINGS.speed);
    expect(loadSettings().difficulty).toBe('normal');
  });
});
