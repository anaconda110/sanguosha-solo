// 音效（M18）：WebAudio 程序合成，零素材文件——守住 ADR-0009 的零版权红线
// （无名杀等素材包永不入库），也不引入任何二进制依赖。
// AudioContext 必须在用户手势后创建/恢复（浏览器自动播放策略）；
// 首次调用前引导层的"知道了"按钮恰好提供这个手势。

export type SoundKind =
  | 'card' // 出牌/打出
  | 'draw' // 摸牌
  | 'damage' // 受伤
  | 'heal' // 回复
  | 'dying' // 濒死
  | 'negate' // 无懈
  | 'judge' // 判定
  | 'equip' // 装备/卸装
  | 'gameover'; // 终局

let ctx: AudioContext | null = null;
let cfg = { on: true, volume: 0.5 };

export function configureSound(on: boolean, volume: number): void {
  cfg = { on, volume };
}

function ensureCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null; // 无 AudioContext（极端环境）时静默降级
  }
}

/** 单音：freq 起始，可选滑到 slide；包络为快起缓落 */
function tone(
  freq: number,
  opts: { dur?: number; type?: OscillatorType; gain?: number; slide?: number; delay?: number } = {},
): void {
  const ac = ensureCtx();
  if (!ac) return;
  const dur = opts.dur ?? 0.1;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  const peak = Math.max(0.0001, (opts.gain ?? 0.12) * cfg.volume);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** 播放一类音效；delay 秒为相对当前时刻的错峰（与动画节奏对齐） */
export function playSound(kind: SoundKind, delay = 0): void {
  if (!cfg.on || cfg.volume <= 0) return;
  switch (kind) {
    case 'card':
      tone(520, { dur: 0.07, gain: 0.12, delay });
      break;
    case 'draw':
      tone(740, { dur: 0.045, gain: 0.06, delay });
      break;
    case 'damage':
      tone(210, { dur: 0.18, type: 'sawtooth', gain: 0.2, slide: 95, delay });
      break;
    case 'heal':
      tone(523, { dur: 0.09, delay });
      tone(784, { dur: 0.14, delay: delay + 0.09 });
      break;
    case 'dying':
      tone(320, { dur: 0.32, type: 'square', gain: 0.16, slide: 110, delay });
      break;
    case 'negate':
      tone(880, { dur: 0.06, delay });
      tone(1245, { dur: 0.11, delay: delay + 0.06 });
      break;
    case 'judge':
      tone(600, { dur: 0.05, gain: 0.08, delay });
      break;
    case 'equip':
      tone(400, { dur: 0.06, delay });
      tone(510, { dur: 0.06, delay: delay + 0.05 });
      break;
    case 'gameover':
      // 终局小琶音（C-E-G-C），输赢同曲——复盘条会说明结果
      for (const [i, f] of [523, 659, 784, 1046].entries()) {
        tone(f, { dur: 0.16, delay: delay + i * 0.13, gain: 0.12 });
      }
      break;
  }
}
