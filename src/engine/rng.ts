// 种子必须存放在 GameState 内（ADR-0002）：克隆状态后重放随机序列结果一致，
// AI 模拟与回放都依赖这一点。

/** 就地更新种子的 mulberry32，返回一个 32 位无符号随机整数。 */
export function randU32(state: { seed: number }): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function shuffleInPlace<T>(state: { seed: number }, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randU32(state) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
