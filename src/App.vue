<script setup lang="ts">
import { computed, ref } from 'vue';
import { aiAction } from './ai/mc';
import { setup } from './engine/setup';
import { hasAnyCard, inShaRange, seatDistance, step } from './engine/step';
import { CARD_INFO, GENERAL_INFO, GENERAL_SEX, GENERAL_SKILLS, IDENTITY_NAMES, SKILL_INFO } from './engine/types';
import type { Action, Card, CardKind, CardSub, EquipSlot, GameEvent, GeneralSub, Phase, SkillSub, Suit, WinSide } from './engine/types';
import { viewOf } from './engine/view';
import { emptyBatch, runOneGame } from './stats';

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

const SIDE_NAMES: Record<WinSide, string> = { zhu: '主公阵营', fan: '反贼', nei: '内奸', draw: '平局（回合耗尽）' };
const REASON_NAMES: Record<string, string> = {
  lebusi: '乐不思蜀',
  bingliang: '兵粮寸断',
  shandian: '闪电',
  bagua: '八卦阵',
  luoshen: '洛神',
  tieji: '铁骑',
  ganglie: '刚烈',
};
const PHASE_NAMES: Record<Phase, string> = { judge: '判定阶段', draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段' };

// —— 立绘（ADR-0009）：程序生成占位徽章；本地素材放 public/avatars/<pinyin>.png 自动覆盖 ——
const AVATAR_PINYIN: Record<string, string> = {
  刘备: 'liubei', 关羽: 'guanyu', 张飞: 'zhangfei', 赵云: 'zhaoyun', 曹操: 'caocao',
  司马懿: 'simayi', 黄盖: 'huanggai', 周瑜: 'zhouyu', 吕布: 'lvbu',
  孙尚香: 'sunshangxiang', 貂蝉: 'diaochan',
  诸葛亮: 'zhugeliang', 甄姬: 'zhenji',
  大乔: 'dajiao', 甘宁: 'ganning',
  马超: 'machao', 孙权: 'sunquan', 夏侯惇: 'xiahoudun', 刘备: 'liubei', 华佗: 'huatuo',
};
const AVATAR_COLORS: Record<string, [string, string]> = {
  liubei: ['#2c5f8a', '#5b9bd5'],
  guanyu: ['#1e4d2b', '#3f9e5a'],
  zhangfei: ['#5c1f1f', '#b04242'],
  zhaoyun: ['#3a2d5c', '#7a63c4'],
  caocao: ['#4a3a12', '#b08a2e'],
  simayi: ['#2a2f3a', '#5a6478'],
  huanggai: ['#5c3a1f', '#a06a2e'],
  zhouyu: ['#5c1f3a', '#b04278'],
  lvbu: ['#3a1f1f', '#8a3a3a'],
  sunshangxiang: ['#7a1f3a', '#c45a8a'],
  diaochan: ['#5c2a5c', '#b06ac4'],
  zhugeliang: ['#1f4a5c', '#3a9eb0'],
  zhenji: ['#2a3a5c', '#6a8ac4'],
  dajiao: ['#3a5c2a', '#7ab04a'],
  ganning: ['#2a2a3a', '#6a6a8a'],
  machao: ['#5c3a1a', '#b07a3a'],
  sunquan: ['#1a3a5c', '#3a7ab0'],
  xiahoudun: ['#3a1a2a', '#8a3a5a'],
  liubei: ['#2c5f8a', '#5b9bd5'],
  huatuo: ['#1f4a3a', '#3a9e7a'],
  baiban: ['#333', '#666'],
};
const avatarFailed = ref<Set<string>>(new Set());

function avatarFallback(name: string): string {
  const pinyin = AVATAR_PINYIN[name] ?? 'baiban';
  const [c1, c2] = AVATAR_COLORS[pinyin] ?? ['#333', '#666'];
  const ch = name[0] ?? '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="64" height="64" rx="8" fill="url(#g)"/>` +
    `<text x="32" y="42" font-size="30" font-family="serif" font-weight="bold" fill="#fff" text-anchor="middle" opacity="0.92">${ch}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function avatarSrc(name: string): string {
  if (avatarFailed.value.has(name)) return avatarFallback(name);
  const pinyin = AVATAR_PINYIN[name];
  return pinyin ? `/avatars/${pinyin}.png` : avatarFallback(name);
}

function onAvatarError(name: string) {
  avatarFailed.value.add(name);
}

const seed = ref(randomSeed());
const humanId = ref(Math.floor(Math.random() * 5));
let state = setup(seed.value);
let gameId = 0;
const view = ref(viewOf(state, humanId.value));
/** 出牌阶段选中的手牌：杀（含技能转换）或需指定目标的锦囊 */
const selected = ref<{ cardId: number; sub: CardSub } | null>(null);
/** 丈八蛇矛：与 selected 配对的第二张手牌（两张当杀） */
const selected2 = ref<Card | null>(null);
/** 方天画戟：多目标选择（确认后一次性使用） */
const fangtianTargets = ref<number[]>([]);
/** 贯石斧：弃两张手牌强行命中的选择 */
const guanshiSel = ref<number[]>([]);
/** 离间三步：按钮 → 点一张手牌 → 点两名男性（先选决斗使用者） */
const lijianMode = ref(false);
const lijianCard = ref<Card | null>(null);
const lijianTargets = ref<number[]>([]);
/** 观星：点选置顶的牌（顺序即摸取顺序） */
const guanxingPick = ref<number[]>([]);
/** 通用主动技多选（M10）：制衡/仁德/青囊——先点技按钮，再点手牌，最后点确认/目标 */
const activeMode = ref<'zhiheng' | 'rende' | 'qingnang' | null>(null);
const activeSel = ref<number[]>([]);
/** 流离两步：点一张手牌弃置 → 点要转移给的男性 */
const liuliPick = ref<Card | null>(null);
const discardSel = ref<number[]>([]);
/** 回放进度；null = 实时画面（ADR-0005：seed+动作重演） */
const replayIdx = ref<number | null>(null);
/** AI 思考指示（ADR-0008：MC 在 Worker 中计算期间点亮，主线程保持可交互） */
const thinking = ref(false);

// —— 演出层（ADR-0009）：只读事件日志，动画不回写引擎状态 ——
let animIdx = 0; // 已经过动画的事件下标（日志只追加，切片即新事件）
let animSeq = 0;
interface Arrow { id: number; x1: number; y1: number; x2: number; y2: number }
interface FloatText { id: number; playerId: number; text: string; kind: string }
interface Flash { id: number; playerId: number; kind: string }
const arrows = ref<Arrow[]>([]);
const floats = ref<FloatText[]>([]);
const flashes = ref<Flash[]>([]);
const seatEls: Record<number, HTMLElement | null> = {};
const seatsBox = ref<HTMLElement | null>(null);

function spawnArrow(fromId: number, toId: number) {
  const box = seatsBox.value;
  const a = seatEls[fromId];
  const b = seatEls[toId];
  if (!box || !a || !b) return;
  const rb = box.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  const rc = b.getBoundingClientRect();
  const id = ++animSeq;
  arrows.value.push({
    id,
    x1: ra.left + ra.width / 2 - rb.left,
    y1: ra.top + ra.height / 2 - rb.top,
    x2: rc.left + rc.width / 2 - rb.left,
    y2: rc.top + rc.height / 2 - rb.top,
  });
  window.setTimeout(() => {
    arrows.value = arrows.value.filter(x => x.id !== id);
  }, 700);
}

function spawnFloat(playerId: number, text: string, kind: string) {
  const id = ++animSeq;
  floats.value.push({ id, playerId, text, kind });
  window.setTimeout(() => {
    floats.value = floats.value.filter(f => f.id !== id);
  }, 1500);
}

function spawnFlash(playerId: number, kind: string) {
  const id = ++animSeq;
  flashes.value.push({ id, playerId, kind });
  window.setTimeout(() => {
    flashes.value = flashes.value.filter(f => f.id !== id);
  }, 850);
}

/** 把 [fromIdx, now) 的新事件映射为动画；批内按 260ms 逐个错开，读出先后感 */
function enqueueAnimations(fromIdx: number) {
  if (replayIdx.value != null) {
    animIdx = state.log.length; // 回放不演出
    return;
  }
  const news = state.log.slice(fromIdx);
  news.forEach((e, i) => {
    const delay = i * 260;
    switch (e.t) {
      case 'playCard': {
        const name = CARD_INFO[e.card].display;
        const ts = e.targets ?? (e.target != null ? [e.target] : []);
        window.setTimeout(() => {
          for (const t of ts) {
            spawnArrow(e.player, t);
            spawnFloat(t, `【${name}】`, 'card');
          }
          if (ts.length === 0) spawnFloat(e.player, `【${name}】`, 'card');
        }, delay);
        break;
      }
      case 'damage':
        window.setTimeout(() => {
          spawnFlash(e.player, 'dmg');
          spawnFloat(e.player, `-${e.amount}`, 'dmg');
        }, delay);
        break;
      case 'heal':
        window.setTimeout(() => spawnFloat(e.player, `+${e.amount}`, 'heal'), delay);
        break;
      case 'dying':
        window.setTimeout(() => spawnFlash(e.player, 'dying'), delay);
        break;
      case 'death':
        window.setTimeout(() => spawnFloat(e.player, '阵亡', 'death'), delay);
        break;
      case 'judge':
        window.setTimeout(
          () => spawnFloat(e.player, `判定 ${e.card.suit}${e.card.rank}【${CARD_INFO[e.card.sub].display}】`, 'judge'),
          delay,
        );
        break;
      case 'skill':
      case 'judgeModify':
        window.setTimeout(() => spawnFloat(e.player, `【${SKILL_INFO[e.sub].display}】`, 'card'), delay);
        break;
      case 'ability':
        window.setTimeout(() => spawnFloat(e.player, `【${CARD_INFO[e.sub].display}】`, 'card'), delay);
        break;
      case 'negate':
        if (e.targetId != null) {
          window.setTimeout(() => spawnFloat(e.targetId!, '无懈可击！', 'wuxie'), delay);
        }
        break;
    }
  });
  animIdx = state.log.length;
}

/** 统一的推进一步：step → 刷新视图 → 排队演出（手牌排序用 FLIP 过渡） */
function applyStep(a: Action) {
  const before = state.log.length;
  const rects = captureHandRects();
  state = step(state, a);
  refresh();
  void flipHand(rects);
  enqueueAnimations(before);
}

const floatsFor = (pid: number) => floats.value.filter(f => f.playerId === pid);
const flashesFor = (pid: number) => flashes.value.filter(f => f.playerId === pid);

// —— 环形桌位布局（ADR-0009）：自己固定下方，其余按顺时针座次环绕 ——
// 相对座次 offset ∈ {1,2,3,4}（1 = 下家）映射到方位；5 人局四家分别落 右/上右/上左/左
const OFFSET_POS: Record<number, string> = { 1: 'right', 2: 'top-right', 3: 'top-left', 4: 'left' };
/** 从我的座次出发，其余玩家的顺时针次序（死者也保持在环上，不跳动） */
const ringOrder = computed(() => {
  const n = view.value.players.length;
  const out: number[] = [];
  for (let k = 1; k < n; k++) out.push((humanId.value + k) % n);
  return out;
});
const seatPos = computed<Record<number, string>>(() => {
  const map: Record<number, string> = { [humanId.value]: 'bottom' };
  ringOrder.value.forEach((pid, i) => {
    map[pid] = OFFSET_POS[i + 1] ?? 'right';
  });
  return map;
});
const orderedPlayers = computed(() => {
  // 自下而上：底部自己、右侧、上右、上左、左侧（DOM 顺序仅作兜底，位置由 class 决定）
  const byId = new Map(view.value.players.map(p => [p.id, p]));
  const self = byId.get(humanId.value);
  const rest = ringOrder.value.map(id => byId.get(id)!).filter(Boolean);
  return self ? [self, ...rest] : rest;
});

// —— AI Worker（ADR-0008）：不可用（如 file:// 直开构建产物）时回退主线程同步计算 ——
let aiWorker: Worker | null = null;
try {
  aiWorker = new Worker(new URL('./ai/worker.ts', import.meta.url), { type: 'module' });
} catch {
  aiWorker = null;
}
let aiSeq = 0;

function askAi(playerId: number): Promise<Action | null> {
  return new Promise(resolve => {
    if (!aiWorker) {
      resolve(aiAction(state, playerId)); // 同步回退：冻结回归但游戏不死
      return;
    }
    const requestId = ++aiSeq;
    let done = false;
    const finish = (a: Action | null) => {
      if (done) return;
      done = true;
      aiWorker?.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve(a);
    };
    const onMsg = (e: MessageEvent<{ action?: Action | null; error?: string; requestId: number }>) => {
      if (e.data.requestId !== requestId) return;
      finish(e.data.action ?? null);
    };
    // Worker 挂死保险丝：15s 未响应则回退主线程同步计算（迟到的响应被忽略）
    const timer = setTimeout(() => finish(aiAction(state, playerId)), 15000);
    aiWorker.addEventListener('message', onMsg);
    // 快照剥离日志：Worker 端仿真不读日志，避免大日志的克隆开销
    const snapshot = { ...state, log: [], actionLog: [] };
    aiWorker.postMessage({ state: snapshot, playerId, requestId });
  });
}

async function scheduleAi() {
  const p = view.value.pending;
  if (!p || view.value.winner) return;
  if (p.playerId === humanId.value && view.value.me) return; // 等真人操作
  const gid = gameId;
  window.setTimeout(async () => {
    if (gid !== gameId || state.winner || !state.pending) return;
    const pid = state.pending.playerId;
    thinking.value = true;
    const a = await askAi(pid);
    thinking.value = false;
    if (gid !== gameId || state.winner || !state.pending || state.pending.playerId !== pid) return;
    if (!a) return;
    applyStep(a);
    void scheduleAi();
  }, 550);
}
void scheduleAi();

function refresh() {
  view.value = viewOf(state, humanId.value);
}

function act(a: Action) {
  replayIdx.value = null;
  applyStep(a);
  cancelSel();
  discardSel.value = [];
  guanshiSel.value = [];
  guanxingPick.value = [];
  liuliPick.value = null;
  activeMode.value = null;
  activeSel.value = [];
  resetLijian();
  refresh();
  scheduleAi();
}

function resetLijian() {
  lijianMode.value = false;
  lijianCard.value = null;
  lijianTargets.value = [];
}

function cancelSel() {
  selected.value = null;
  selected2.value = null;
  fangtianTargets.value = [];
}

function newGame() {
  gameId++;
  seed.value = randomSeed();
  humanId.value = Math.floor(Math.random() * 5);
  state = setup(seed.value);
  cancelSel();
  discardSel.value = [];
  guanshiSel.value = [];
  guanxingPick.value = [];
  liuliPick.value = null;
  activeMode.value = null;
  activeSel.value = [];
  resetLijian();
  replayIdx.value = null;
  arrows.value = [];
  floats.value = [];
  flashes.value = [];
  animIdx = state.log.length; // 新局不补演开场事件
  refresh();
  scheduleAi();
}

const me = computed(() => view.value.me);
const meP = computed(() => view.value.players.find(p => p.id === humanId.value));
const myGeneral = computed(() => state.players[humanId.value]!.general);
const pend = computed(() => {
  const p = view.value.pending;
  return p && p.playerId === humanId.value && view.value.me ? p : null;
});
const waitingName = computed(() => {
  const p = view.value.pending;
  return p ? view.value.players[p.playerId]!.name : '';
});
const discardCount = computed(() => view.value.pending?.count ?? 0);
const canConfirmDiscard = computed(() => discardSel.value.length === discardCount.value);
const canSha = computed(
  () =>
    !view.value.playedSha ||
    meP.value?.equips.includes('liannu') ||
    myGeneral.value === 'zhangfei',
);
const replayTotal = computed(() => state.actionLog.length);
/** 武将图鉴面板开关 */
const showCodex = ref(false);
/** 战绩统计面板（M9）：批量规则 AI 自战 */
const showStats = ref(false);
const batchRunning = ref(false);
const batchDone = ref(0);
const batchTotal = ref(0);
const batchAcc = ref(emptyBatch());
const SIDE_ORDER: Array<'zhu' | 'fan' | 'nei' | 'draw'> = ['zhu', 'fan', 'nei', 'draw'];
const generalRows = computed(() =>
  Object.entries(batchAcc.value.generals)
    .map(([general, st]) => ({
      general,
      display: GENERAL_INFO[general as GeneralSub]?.display ?? general,
      games: st.games,
      wins: st.wins,
      rate: st.games > 0 ? ((st.wins / st.games) * 100).toFixed(0) : '0',
    }))
    .sort((a, b) => b.games - a.games || a.general.localeCompare(b.general)),
);

/** 分批跑 N 局：每局之间 setTimeout 让出主线程，面板实时刷新进度 */
async function runBatch(n: number) {
  if (batchRunning.value) return;
  batchRunning.value = true;
  batchDone.value = 0;
  batchTotal.value = n;
  batchAcc.value = emptyBatch();
  const acc = batchAcc.value;
  for (let i = 0; i < n; i++) {
    runOneGame(1000 + i, acc);
    batchDone.value = i + 1;
    await new Promise(r => setTimeout(r, 0));
  }
  batchRunning.value = false;
}

const isRedCard = (c: Card) => c.suit === ('♥' as Suit) || c.suit === ('♦' as Suit);

/** 装备了丈八蛇矛：任意两张手牌可当杀 */
const zhangbaOn = computed(() => meP.value?.equips.includes('zhangba') ?? false);

// —— 离间（貂蝉）：三步交互 ——
const aliveMales = computed(() =>
  view.value.players.filter(p => p.alive && p.sex === 'm' && p.id !== humanId.value),
);
const lijianReady = computed(
  () =>
    pend.value?.kind === 'play' &&
    mySkills.value.includes('lijian') &&
    !state.usedSkills.includes('lijian') &&
    (me.value?.hand.length ?? 0) >= 1 &&
    aliveMales.value.length >= 2,
);
function toggleLijian() {
  resetLijian();
  lijianMode.value = true;
}
/** 离间选目标：点选两名男性，集齐即提交 */
function lijianSeatClick(pid: number) {
  const i = lijianTargets.value.indexOf(pid);
  if (i >= 0) {
    lijianTargets.value.splice(i, 1);
    return;
  }
  if (lijianTargets.value.length >= 2) return;
  lijianTargets.value.push(pid);
  if (lijianTargets.value.length === 2 && lijianCard.value) {
    act({ type: 'useSkill', sub: 'lijian', cardId: lijianCard.value.id, targetIds: [...lijianTargets.value] });
  }
}
/** 方天画戟多目标可用：选中的杀是最后一张手牌 */
const fangtianEligible = computed(() => {
  if (pend.value?.kind !== 'play' || selected.value?.sub !== 'sha' || selected2.value) return false;
  if (!meP.value?.equips.includes('fangtian')) return false;
  return (me.value?.hand.length ?? 0) === 1;
});

const myGeneralState = computed(() => state.players[humanId.value]!);
const mySkills = computed(() => GENERAL_SKILLS[myGeneral.value]);

/** 当前武将可当【杀】用的非杀牌（武圣红牌/龙胆闪）；满血时桃也算武圣素材 */
function altShaMaterial(): Card | undefined {
  const g = myGeneral.value;
  if (g !== 'guanyu' && g !== 'zhaoyun') return undefined;
  const hand = me.value?.hand ?? [];
  const fullHp = (meP.value?.hp ?? 0) >= (meP.value?.maxHp ?? 0);
  return g === 'guanyu'
    ? hand.find(c => isRedCard(c) && (c.sub !== 'tao' || fullHp))
    : hand.find(c => c.sub === 'shan');
}

/** 杀素材（含真杀），用于青龙偃月刀再杀 */
function shaMaterialNow(): Card | undefined {
  return me.value?.hand.find(c => c.sub === 'sha') ?? altShaMaterial();
}

function hasCardInHand(sub: CardSub): boolean {
  return !!me.value?.hand.some(c => c.sub === sub);
}

/** 手牌技能角标：返回该牌当前可用技能名，无则 null（提示可当杀/当闪） */
function skillHint(c: Card): string | null {
  const g = myGeneral.value;
  if (g === 'guanyu') {
    if (c.sub === 'sha') return null;
    if (c.sub === 'tao') return (meP.value?.hp ?? 0) >= (meP.value?.maxHp ?? 0) ? '武圣' : null;
    return isRedCard(c) ? '武圣' : zhangbaHint(c);
  }
  if (g === 'zhaoyun') {
    if (c.sub === 'shan') return null;
    if (c.sub === 'sha') return '龙胆·闪';
    return zhangbaHint(c);
  }
  if (g === 'zhenji') {
    if (c.sub === 'shan') return null;
    if (!isRedCard(c)) return '倾国';
    return zhangbaHint(c);
  }
  if (g === 'dajiao') {
    if (c.suit === ('♦' as Suit) && CARD_INFO[c.sub].kind !== 'trick' && c.sub !== 'tao') return '国色';
    return zhangbaHint(c);
  }
  if (g === 'ganning') {
    if (!isRedCard(c) && CARD_INFO[c.sub].kind !== 'trick' && c.sub !== 'tao') return '奇袭';
    return zhangbaHint(c);
  }
  return zhangbaHint(c);
}

/** 丈八蛇矛：非桃手牌都能凑两张当杀 */
function zhangbaHint(c: Card): string | null {
  return zhangbaOn.value && c.sub !== 'tao' ? '丈八' : null;
}

/** 通用主动技的提示文案 */
const activeModePrompt = computed(() => {
  const n = activeSel.value.length;
  switch (activeMode.value) {
    case 'zhiheng':
      return `点手牌选择要弃置的牌（已选 ${n} 张）`;
    case 'rende':
      return `点手牌选择要给出的牌（已选 ${n} 张）——再点一名其他角色赠予`;
    case 'qingnang':
      return n === 0 ? '点一张手牌作为代价' : '再点一名已受伤的角色';
    default:
      return '';
  }
});

/** 我的技能是否处于可发动状态（座次与提示条共用） */
const mySkillReady = computed(() => {
  const g = myGeneral.value;
  const hand = me.value?.hand ?? [];
  if (g === 'guanyu') {
    const fullHp = (meP.value?.hp ?? 0) >= (meP.value?.maxHp ?? 0);
    return hand.some(c => c.sub !== 'sha' && (c.sub === 'tao' ? fullHp : isRedCard(c)));
  }
  if (g === 'zhaoyun') return hand.some(c => c.sub === 'shan' || c.sub === 'sha');
  if (g === 'zhangfei') return !view.value.playedSha;
  if (g === 'huanggai') return (meP.value?.hp ?? 0) > 1;
  if (g === 'lvbu') return true;
  if (g === 'diaochan') return aliveMales.value.length >= 2 && (me.value?.hand.length ?? 0) >= 1;
  if (g === 'simayi' || g === 'zhouyu' || g === 'caocao') return false; // 触发技：受伤时点亮
  return false;
});

/** 座次技能激活态：可主动发动的技能在素材可用时点亮 */
function seatSkillOn(pid: number): boolean {
  if (pid === humanId.value) return mySkillReady.value;
  const p = view.value.players.find(x => x.id === pid);
  if (!p || !p.alive) return false;
  return p.general === 'zhangfei' || p.general === 'lvbu'; // 锁定技常时点亮
}

function isTargetable(pid: number): boolean {
  const sel = selected.value;
  if (activeMode.value === 'rende') {
    const t = view.value.players[pid]!;
    return activeSel.value.length > 0 && t.alive && pid !== humanId.value;
  }
  if (activeMode.value === 'qingnang') {
    const t = view.value.players[pid]!;
    return activeSel.value.length === 1 && t.alive && t.hp < t.maxHp;
  }
  if (lijianMode.value && lijianCard.value) {
    const t = view.value.players[pid]!;
    return t.alive && t.id !== humanId.value && t.sex === 'm';
  }
  if (pend.value?.kind === 'liuli' && liuliPick.value) {
    return (pend.value.liuliTo ?? []).includes(pid);
  }
  if (!sel || pend.value?.kind !== 'play') return false;
  const t = view.value.players[pid]!;
  if (!t.alive || t.id === humanId.value) return false;
  if (sel.sub === 'sha') return inShaRange(state, humanId.value, pid);
  if (sel.sub === 'shunshou')
    return hasAnyCard(state.players[pid]!) && seatDistance(state, humanId.value, pid) <= 1;
  if (sel.sub === 'lebusi') return !t.judgements.includes('lebusi');
  if (sel.sub === 'bingliang')
    return !t.judgements.includes('bingliang') && seatDistance(state, humanId.value, pid) <= 1;
  // guohe / juedou
  return hasAnyCard(state.players[pid]!);
}

/** 出牌阶段的卡牌点击语义 */
function onCardClick(c: Card) {
  if (pend.value?.kind === 'play') {
    if (lijianMode.value) {
      if (!lijianCard.value) lijianCard.value = c; // 第一步：选弃置的手牌
      return;
    }
    if (activeMode.value) {
      // 制衡/仁德：多选切换；青囊：单选（点新牌替换）
      const i = activeSel.value.indexOf(c.id);
      if (activeMode.value === 'qingnang') activeSel.value = i >= 0 ? [] : [c.id];
      else if (i >= 0) activeSel.value.splice(i, 1);
      else activeSel.value.push(c.id);
      return;
    }
    // 丈八蛇矛：已选中一张杀素材时，再点任意不同手牌 → 组成两张当杀
    if (zhangbaOn.value && canSha.value && selected.value?.sub === 'sha' && !selected2.value) {
      if (c.id === selected.value.cardId) {
        cancelSel();
        return;
      }
      selected2.value = c;
      return;
    }
    if (c.sub === 'tao' && meP.value && meP.value.hp < meP.value.maxHp) {
      act({ type: 'playTao', cardId: c.id });
    } else if (CARD_INFO[c.sub].kind === 'equip') {
      act({ type: 'playEquip', cardId: c.id });
    } else if (
      c.sub === 'wuzhong' || c.sub === 'nanman' || c.sub === 'wanjian' ||
      c.sub === 'taoyuan' || c.sub === 'shandian'
    ) {
      act({ type: 'playTrick', cardId: c.id }); // 无需指定目标
    } else if (c.sub === 'sha' && canSha.value) {
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
      fangtianTargets.value = [];
    } else if (c.sub !== 'sha' && c.sub !== 'wuxie' && altShaMaterial()?.id === c.id && canSha.value) {
      // 武圣/龙胆：红牌或闪当作杀
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
      fangtianTargets.value = [];
    } else if (
      c.sub === 'guohe' || c.sub === 'shunshou' || c.sub === 'juedou' ||
      c.sub === 'lebusi' || c.sub === 'bingliang'
    ) {
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: c.sub };
    } else if (myGeneral.value === 'dajiao' && c.suit === ('♦' as Suit) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick') {
      // 国色：方块非锦囊牌当乐不思蜀
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'lebusi' };
    } else if (myGeneral.value === 'ganning' && !isRedCard(c) && c.sub !== 'tao' && CARD_INFO[c.sub].kind !== 'trick') {
      // 奇袭：黑色非锦囊牌当过河拆桥
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'guohe' };
    } else if (zhangbaOn.value && canSha.value) {
      // 丈八蛇矛：任意手牌（闪/无懈等）都能作为杀的第一张
      selected.value = selected.value?.cardId === c.id ? null : { cardId: c.id, sub: 'sha' };
      fangtianTargets.value = [];
    }
    // 闪（非龙胆）/无懈可击不能主动使用
  } else if (pend.value?.kind === 'discard') {
    const i = discardSel.value.indexOf(c.id);
    if (i >= 0) discardSel.value.splice(i, 1);
    else if (discardSel.value.length < discardCount.value) discardSel.value.push(c.id);
  } else if (pend.value?.kind === 'skillCard') {
    // 鬼才：点手牌替换判定牌
    act({ type: 'respondSkillCard', cardId: c.id });
  } else if (pend.value?.kind === 'guanshi') {
    // 贯石斧：点两张手牌
    const i = guanshiSel.value.indexOf(c.id);
    if (i >= 0) guanshiSel.value.splice(i, 1);
    else if (guanshiSel.value.length < 2) guanshiSel.value.push(c.id);
  } else if (pend.value?.kind === 'liuli') {
    // 流离：先点弃置的手牌
    liuliPick.value = c;
  }
}

/** 观星：点牌按顺序置顶，再点取消 */
function onGuanxingClick(c: Card) {
  const i = guanxingPick.value.indexOf(c.id);
  if (i >= 0) guanxingPick.value.splice(i, 1);
  else guanxingPick.value.push(c.id);
}

function onSeatClick(pid: number) {
  if (activeMode.value === 'rende') {
    const t = view.value.players[pid]!;
    if (!t.alive || pid === humanId.value || activeSel.value.length === 0) return;
    act({ type: 'useSkill', sub: 'rende', cardIds: [...activeSel.value], targetIds: [pid] });
    return;
  }
  if (activeMode.value === 'qingnang') {
    const t = view.value.players[pid]!;
    if (!t.alive || t.hp >= t.maxHp || activeSel.value.length !== 1) return;
    act({ type: 'useSkill', sub: 'qingnang', cardId: activeSel.value[0], targetIds: [pid] });
    return;
  }
  if (lijianMode.value && lijianCard.value) {
    if (!isTargetable(pid)) return;
    lijianSeatClick(pid);
    return;
  }
  if (pend.value?.kind === 'liuli' && liuliPick.value) {
    if (!isTargetable(pid)) return;
    act({ type: 'respondLiuli', cardId: liuliPick.value.id, transferTo: pid });
    return;
  }
  if (!selected.value || pend.value?.kind !== 'play') return;
  if (!isTargetable(pid)) return;
  if (selected.value.sub === 'sha') {
    if (fangtianEligible.value) {
      // 方天画戟：目标点击切换选择，确认按钮统一使用
      const i = fangtianTargets.value.indexOf(pid);
      if (i >= 0) fangtianTargets.value.splice(i, 1);
      else if (fangtianTargets.value.length < 3) fangtianTargets.value.push(pid);
      return;
    }
    act({ type: 'playSha', cardId: selected.value.cardId, cardId2: selected2.value?.id, targetId: pid });
  } else {
    act({ type: 'playTrick', cardId: selected.value.cardId, targetId: pid });
  }
}

/** 方天画戟确认：单目标走普通使用，多目标走 targetIds */
function confirmFangtian() {
  if (!selected.value || fangtianTargets.value.length === 0) return;
  const ts = [...fangtianTargets.value];
  if (ts.length === 1) act({ type: 'playSha', cardId: selected.value.cardId, targetId: ts[0]! });
  else act({ type: 'playSha', cardId: selected.value.cardId, targetId: ts[0]!, targetIds: ts });
}

/** 出【闪】按钮：真闪/龙胆（赵云）/倾国（甄姬黑牌）任一素材可用 */
const shanRespondable = computed(() => {
  const g = myGeneral.value;
  const hand = me.value?.hand ?? [];
  if (hand.some(c => c.sub === 'shan')) return true;
  if (g === 'zhaoyun') return hand.some(c => c.sub === 'sha');
  if (g === 'zhenji') return hand.some(c => !isRedCard(c));
  return false;
});
const shanButtonLabel = computed(() => {
  const g = myGeneral.value;
  const hand = me.value?.hand ?? [];
  const hasShan = hand.some(c => c.sub === 'shan');
  if (!hasShan && g === 'zhaoyun' && hand.some(c => c.sub === 'sha')) return '用【杀】代替（龙胆）';
  if (!hasShan && g === 'zhenji') return '用黑色手牌代替（倾国）';
  return '出【闪】';
});

function respondShan(use: boolean) {  if (!use) {
    act({ type: 'respondShan', cardId: null });
    return;
  }
  // 优先出真【闪】；龙胆无闪可用【杀】；倾国无闪可用黑色手牌（桃必为红色，不会被误出）
  const hand = me.value?.hand ?? [];
  const card =
    hand.find(c => c.sub === 'shan') ??
    (myGeneral.value === 'zhaoyun' ? hand.find(c => c.sub === 'sha') : undefined) ??
    (myGeneral.value === 'zhenji' ? hand.find(c => !isRedCard(c)) : undefined);
  act({ type: 'respondShan', cardId: card ? card.id : null });
}

function respondSha(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'sha') : undefined;
  act({ type: 'respondSha', cardId: card ? card.id : null });
}

function respondShaAlt() {
  const card = altShaMaterial();
  if (card) act({ type: 'respondSha', cardId: card.id });
}

function respondWuxie(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'wuxie') : undefined;
  act({ type: 'respondWuxie', cardId: card ? card.id : null });
}

/** 急救（华佗）：红色非桃手牌可当桃 */
function jijiuMaterial(): Card | undefined {
  return me.value?.hand.find(c => c.sub !== 'tao' && isRedCard(c));
}

function respondTao(use: boolean) {
  const card = use ? me.value?.hand.find(c => c.sub === 'tao') : undefined;
  act({ type: 'respondTao', cardId: card ? card.id : null });
}

function respondTaoAlt() {
  const card = jijiuMaterial();
  act({ type: 'respondTao', cardId: card ? card.id : null });
}

/** 选牌（拆/顺）：pickTarget 为被选牌玩家，pickOpts 为可选项（ADR-0008） */
const pickTarget = computed(() => {
  const p = pend.value;
  return p?.kind === 'pickCard' && p.trickTargetId != null
    ? view.value.players.find(x => x.id === p.trickTargetId)
    : undefined;
});
const pickOpts = computed(() => {
  const t = pickTarget.value;
  if (!t || !t.alive) return [] as Array<{ from: EquipSlot | 'hand'; label: string }>;
  const slots = t.equipSlots;
  const out: Array<{ from: EquipSlot | 'hand'; label: string }> = [];
  if (slots.weapon) out.push({ from: 'weapon', label: disp(slots.weapon) });
  if (slots.shield) out.push({ from: 'shield', label: disp(slots.shield) });
  if (slots.jian1ma) out.push({ from: 'jian1ma', label: disp(slots.jian1ma) });
  if (slots.jia1ma) out.push({ from: 'jia1ma', label: disp(slots.jia1ma) });
  if (t.handCount > 0) out.push({ from: 'hand', label: `手牌（暗）×${t.handCount}，随机抽一张` });
  return out;
});

function pickCard(from: EquipSlot | 'hand') {
  act({ type: 'pickCard', from });
}

function shaAgain(use: boolean) {
  const card = use ? shaMaterialNow() : undefined;
  act({ type: 'shaAgain', cardId: card ? card.id : null });
}

function disp(sub: CardSub): string {
  return CARD_INFO[sub].display;
}

/** 回放：从 setup(seed) 重演前 k 个动作（ADR-0005） */
function showReplay(k: number | null) {
  replayIdx.value = k;
  if (k == null) {
    refresh();
    return;
  }
  let s = setup(seed.value);
  for (let i = 0; i < k; i++) s = step(s, state.actionLog[i]!);
  view.value = viewOf(s, humanId.value);
}

// —— 手牌排序 FLIP（ADR-0009）：类型分组（基本→锦囊→装备）+ 花色点数 ——
const KIND_ORDER: Record<CardKind, number> = { basic: 0, trick: 1, equip: 2 };
const SUIT_ORDER: Record<Suit, number> = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
const handSorted = computed(() => {
  const hand = me.value?.hand ?? [];
  return [...hand].sort((a, b) => {
    const k = KIND_ORDER[CARD_INFO[a.sub].kind] - KIND_ORDER[CARD_INFO[b.sub].kind];
    if (k !== 0) return k;
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (s !== 0) return s;
    return a.rank - b.rank;
  });
});

/** FLIP：记录旧位置，DOM 更新后平移动画到新位置 */
function captureHandRects(): Map<number, DOMRect> {
  const m = new Map<number, DOMRect>();
  document.querySelectorAll<HTMLElement>('.hand .card[data-cid]').forEach(el => {
    m.set(Number(el.dataset.cid), el.getBoundingClientRect());
  });
  return m;
}
async function flipHand(from: Map<number, DOMRect>) {
  await nextTick();
  document.querySelectorAll<HTMLElement>('.hand .card[data-cid]').forEach(el => {
    const old = from.get(Number(el.dataset.cid));
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left;
    if (Math.abs(dx) < 1) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.28s ease';
      el.style.transform = '';
    });
  });
}

function evText(e: GameEvent): string {
  const n = (id?: number) => (id == null ? '' : view.value.players[id]!.name);
  switch (e.t) {
    case 'turnStart':
      return `── ${n(e.player)} 的回合 ──`;
    case 'draw':
      return `${n(e.player)} 摸了 ${e.n} 张牌`;
    case 'playCard': {
      const ts = e.targets ?? (e.target != null ? [e.target] : []);
      return ts.length > 1
        ? `${n(e.player)} 对 ${ts.map(n).join('、')} 使用【${disp(e.card)}】`
        : e.target != null
          ? `${n(e.player)} 对 ${n(e.target)} 使用【${disp(e.card)}】`
          : `${n(e.player)} 使用【${disp(e.card)}】`;
    }
    case 'respond':
      return e.card
        ? `${n(e.player)} 打出【${disp(e.card)}】`
        : e.resp === 'shan'
          ? `${n(e.player)} 未出【闪】`
          : e.resp === 'sha'
            ? `${n(e.player)} 未打出【杀】`
            : e.resp === 'wuxie'
              ? `${n(e.player)} 不使用【无懈可击】`
              : `${n(e.player)} 不使用【桃】`;
    case 'damage':
      return `${n(e.player)} 受到 ${e.amount} 点伤害`;
    case 'heal':
      return `${n(e.player)} 回复 ${e.amount} 点体力`;
    case 'dying':
      return `⚠ ${n(e.player)} 濒死！`;
    case 'death':
      return `${n(e.player)} 阵亡，身份是【${IDENTITY_NAMES[e.identity]}】`;
    case 'rewardDraw':
      return `${n(e.player)} 摸三张牌（杀死反贼的奖惩）`;
    case 'penaltyDiscard':
      return `${n(e.player)} 弃置全部手牌（主公杀死忠臣的惩罚）`;
    case 'discardCards':
      return `${n(e.player)} 弃置 ${e.n} 张牌`;
    case 'equip':
      return `${n(e.player)} 装备了【${disp(e.sub)}】`;
    case 'unequip':
      return `${n(e.player)} 的【${disp(e.sub)}】被弃置`;
    case 'gainCard':
      return `${n(e.player)} 获得了 ${n(e.from)} 的一张牌`;
    case 'negate':
      return e.targetId != null
        ? `${n(e.player)} 用【无懈可击】抵消了【${disp(e.sub)}】对 ${n(e.targetId)} 的效果`
        : `${n(e.player)} 用【无懈可击】抵消了【${disp(e.sub)}】`;
    case 'judge':
      return `${n(e.player)} 的【${REASON_NAMES[e.reason]}】判定 → ${e.card.suit}${e.card.rank}【${disp(e.card.sub)}】`;
    case 'judgeModify':
      return `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】改判为 ${e.card.suit}${e.card.rank}【${disp(e.card.sub)}】`;
    case 'skill':
      return e.detail
        ? `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】（${e.detail}）`
        : `${n(e.player)} 发动【${SKILL_INFO[e.sub].display}】`;
    case 'ability':
      return e.detail
        ? `${n(e.player)} 发动【${disp(e.sub)}】（${e.detail}）`
        : `${n(e.player)} 发动【${disp(e.sub)}】`;
    case 'moveJudgement':
      return `【${disp(e.sub)}】移至 ${n(e.to)} 的判定区`;
    case 'gameOver':
      return `■■ ${SIDE_NAMES[e.side]} 获胜 ■■`;
  }
}
</script>

<template>
  <div class="app">
    <header>
      <h1>三国杀单机 <span class="m1">M10</span></h1>
      <div class="meta">
        <span class="seed">seed {{ seed }}</span>
        <span v-if="me" class="badge" :class="'id-' + me.identity">
          你的身份：{{ IDENTITY_NAMES[me.identity] }}
        </span>
        <span v-else class="badge dead-badge">你已阵亡 · 观战中</span>
        <button class="btn ghost" @click="showCodex = !showCodex">武将图鉴</button>
        <button class="btn ghost" @click="showStats = !showStats">战绩统计</button>
        <button class="btn" @click="newGame">新一局</button>
      </div>
    </header>

    <section v-if="showStats" class="codex stats-panel">
      <div class="stats-head">
        <b>战绩统计</b>
        <span v-if="batchRunning">模拟中… {{ batchDone }}/{{ batchTotal }} 局</span>
        <span v-else-if="batchAcc.games > 0">已完成 {{ batchAcc.games }} 局（seed 1000 起，可复现）</span>
        <span v-else>规则 AI 自战批量对局</span>
        <button class="btn" :disabled="batchRunning" @click="runBatch(20)">跑 20 局</button>
        <button class="btn" :disabled="batchRunning" @click="runBatch(100)">跑 100 局</button>
      </div>
      <template v-if="batchAcc.games > 0">
        <div class="stats-line">
          胜方：
          <span v-for="s in SIDE_ORDER" :key="s" class="stats-side">
            {{ SIDE_NAMES[s] }} {{ batchAcc.sideWins[s] ?? 0 }}（{{
              ((batchAcc.sideWins[s] ?? 0) / batchAcc.games * 100).toFixed(0)
            }}%）
          </span>
          ｜平均 {{ (batchAcc.stepsSum / batchAcc.games).toFixed(0) }} 步，最长 {{ batchAcc.maxSteps }} 步
        </div>
        <table class="stats-table">
          <thead>
            <tr><th>武将</th><th>出场</th><th>胜场</th><th>胜率</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in generalRows" :key="r.general">
              <td>{{ r.display }}</td>
              <td>{{ r.games }}</td>
              <td>{{ r.wins }}</td>
              <td>{{ r.rate }}%</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <section v-if="showCodex" class="codex">
      <div v-for="(info, g) in GENERAL_INFO" :key="g" class="codex-item">
        <span class="codex-name" :class="{ 'codex-f': GENERAL_SEX[g] === 'f' }">{{ info.display }}</span>
        <span class="codex-skills">
          <span v-for="sk in GENERAL_SKILLS[g]" :key="sk" class="codex-skill">
            <b>【{{ SKILL_INFO[sk].display }}】</b>{{ SKILL_INFO[sk].desc }}
          </span>
          <span v-if="GENERAL_SKILLS[g].length === 0" class="codex-skill">无技能</span>
        </span>
      </div>
    </section>

    <div v-if="view.winner" class="winner">🏆 {{ SIDE_NAMES[view.winner.side] }} 获胜</div>

    <div v-if="view.winner" class="replay-bar">
      <span>回放</span>
      <button class="btn ghost" @click="showReplay(Math.max(0, (replayIdx ?? replayTotal) - 1))">◀</button>
      <span>{{ replayIdx ?? replayTotal }} / {{ replayTotal }}</span>
      <button class="btn ghost" @click="showReplay(Math.min(replayTotal, (replayIdx ?? replayTotal) + 1))">▶</button>
      <button class="btn ghost" @click="showReplay(null)">退出回放</button>
    </div>

    <section class="table" ref="seatsBox">
      <svg v-if="arrows.length" class="arrow-layer">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#e05555" />
          </marker>
        </defs>
        <line
          v-for="a in arrows"
          :key="a.id"
          :x1="a.x1"
          :y1="a.y1"
          :x2="a.x2"
          :y2="a.y2"
          class="arrow-line"
          marker-end="url(#arrowhead)"
        />
      </svg>
      <div
        v-for="p in orderedPlayers"
        :key="p.id"
        :ref="el => { seatEls[p.id] = el as HTMLElement | null; }"
        class="seat"
        :class="[
          'pos-' + seatPos[p.id],
          {
            me: p.id === humanId,
            turn: p.id === view.players[view.turnIdx]!.id && !view.winner,
            dead: !p.alive,
            targetable: isTargetable(p.id),
            'flash-dmg': flashesFor(p.id).some(f => f.kind === 'dmg'),
            'flash-dying': flashesFor(p.id).some(f => f.kind === 'dying'),
          },
        ]"
        @click="onSeatClick(p.id)"
      >
        <div class="phead">
          <img
            class="avatar"
            :src="avatarSrc(p.name)"
            :alt="p.name"
            @error="onAvatarError(p.name)"
          />
          <div class="pname">{{ p.name }}<span class="sex" :class="{ 'sex-f': p.sex === 'f' }">{{ p.sex === 'f' ? '♀' : '♂' }}</span> <span v-if="p.id === humanId" class="you">你</span></div>
        </div>
        <div class="pid" :class="p.identity ? 'id-' + p.identity : ''">
          {{ p.identity ? IDENTITY_NAMES[p.identity] : '身份?' }}
        </div>
        <div class="hp">
          <span v-for="i in p.maxHp" :key="i" class="heart" :class="{ on: i <= p.hp }">♥</span>
        </div>
        <div
          class="skill"
          :class="{ 'skill-on': seatSkillOn(p.id) }"
        >
          {{ GENERAL_INFO[p.general].skill || '白板' }}
        </div>
        <div class="equips">{{ p.equips.map(disp).join(' · ') }}</div>
        <div class="judgs">{{ p.judgements.map(disp).join(' ') }}</div>
        <div class="handcount">手牌 {{ p.handCount }}</div>
        <div class="float-layer">
          <div v-for="f in floatsFor(p.id)" :key="f.id" class="float" :class="'float-' + f.kind">
            {{ f.text }}
          </div>
        </div>
      </div>
      <div class="center">
        <div class="pile">牌堆 {{ view.deckCount }}</div>
        <div class="pile">弃牌 {{ view.discardCount }}</div>
        <div class="center-turn">
          {{ view.winner ? '对局结束' : '当前：' + view.players[view.turnIdx]!.name }}
        </div>
        <div class="center-phase">{{ PHASE_NAMES[view.phase] }}</div>
      </div>
    </section>

    <section class="prompt">
      <template v-if="view.winner">对局结束——可用下方回放逐步检视整局。</template>
      <template v-else-if="pend?.kind === 'play'">
        <template v-if="activeMode">
          【{{ SKILL_INFO[activeMode].display }}】{{ activeModePrompt }}
          <button
            v-if="activeMode === 'zhiheng' && activeSel.length > 0"
            class="btn"
            @click="act({ type: 'useSkill', sub: 'zhiheng', cardIds: [...activeSel] })"
          >确认制衡</button>
          <button class="btn ghost" @click="activeMode = null; activeSel = []">取消</button>
        </template>
        <template v-else-if="lijianMode">
          【离间】{{ !lijianCard ? '点一张手牌弃置' : `已选【${disp(lijianCard.sub)}】——点两名男性角色（先选决斗使用者）` }}（已选 {{ lijianTargets.length }}/2）
          <button class="btn ghost" @click="resetLijian">取消</button>
        </template>
        <template v-else-if="selected && fangtianTargets.length > 0">
          【方天画戟】已选 {{ fangtianTargets.length }} 个目标——
          <button class="btn" @click="confirmFangtian">使用【杀】</button>
          <button class="btn ghost" @click="fangtianTargets = []">重选目标</button>
          <button class="btn ghost" @click="cancelSel">取消</button>
        </template>
        <template v-else-if="selected && selected2">
          已选两张当【杀】（丈八蛇矛）——点目标玩家使用
          <button class="btn ghost" @click="cancelSel">取消</button>
        </template>
        <template v-else-if="selected">
          已选【{{ disp(selected.sub) }}】——点目标玩家使用
          <button class="btn ghost" @click="cancelSel">取消</button>
        </template>
        <template v-else>
          出牌阶段（{{ GENERAL_INFO[myGeneral].skill || '白板' }}）：点牌使用；杀/锦囊需再点目标
          <button
            v-if="mySkills.includes('kurou') && !state.usedSkills.includes('kurou') && (meP?.hp ?? 0) > 1"
            class="btn"
            @click="act({ type: 'useSkill', sub: 'kurou' })"
          >
            苦肉（-1体力 摸2张）
          </button>
          <button v-if="lijianReady && !lijianMode" class="btn" @click="toggleLijian">
            离间（弃1牌 两名男性决斗）
          </button>
          <button
            v-if="mySkills.includes('zhiheng') && !state.usedSkills.includes('zhiheng') && (me?.hand.length ?? 0) >= 1"
            class="btn"
            @click="activeMode = 'zhiheng'; activeSel = []"
          >
            制衡（弃任意张 摸等量）
          </button>
          <button
            v-if="mySkills.includes('rende') && !state.usedSkills.includes('rende') && (me?.hand.length ?? 0) >= 1"
            class="btn"
            @click="activeMode = 'rende'; activeSel = []"
          >
            仁德（给牌 2张回1血）
          </button>
          <button
            v-if="mySkills.includes('qingnang') && !state.usedSkills.includes('qingnang') && (me?.hand.length ?? 0) >= 1"
            class="btn"
            @click="activeMode = 'qingnang'; activeSel = []"
          >
            青囊（弃1牌 目标回1血）
          </button>
          <button class="btn" @click="act({ type: 'endPlay' })">结束出牌</button>
        </template>
      </template>
      <template v-else-if="pend?.kind === 'respondShan'">
        {{ pend.trickSub === 'wanjian' ? '【万箭齐发】——需打出【闪】，否则受到 1 点伤害' : '你成为【杀】的目标 ——' }}
        <button
          class="btn"
          :disabled="!shanRespondable"
          @click="respondShan(true)"
        >
          {{ shanButtonLabel }}
        </button>
        <button
          v-if="meP?.equips.includes('bagua') && !pend.baguaTried && !pend.qinggang"
          class="btn"
          @click="act({ type: 'respondBagua' })"
        >
          八卦判定
        </button>
        <button class="btn" @click="respondShan(false)">不出</button>
      </template>
      <template v-else-if="pend?.kind === 'cixiong' && pend.cixiong">
        【雌雄双股剑】—— {{ view.players[pend.cixiong.sourceId]!.name }} 对你使用【杀】：
        <button class="btn" @click="act({ type: 'respondCixiong', discard: true })">弃一张手牌（杀无效）</button>
        <button class="btn" @click="act({ type: 'respondCixiong', discard: false })">让他摸一张牌</button>
      </template>
      <template v-else-if="pend?.kind === 'guanshi'">
        【贯石斧】——【杀】被闪避，弃两张手牌强行命中？（已选 {{ guanshiSel.length }}/2）
        <button class="btn" :disabled="guanshiSel.length !== 2" @click="act({ type: 'respondGuanshi', cardIds: [...guanshiSel] })">
          强行命中
        </button>
        <button class="btn" @click="act({ type: 'respondGuanshi', cardIds: null })">不发动</button>
      </template>
      <template v-else-if="pend?.kind === 'respondSha'">
        {{ pend.trickSub === 'juedou' ? '【决斗】——轮到你打出【杀】' : '【南蛮入侵】——需打出【杀】，否则受到 1 点伤害' }}
        <button class="btn" :disabled="!hasCardInHand('sha')" @click="respondSha(true)">打出【杀】</button>
        <button v-if="altShaMaterial()" class="btn" @click="respondShaAlt()">
          用【{{ disp(altShaMaterial()!.sub) }}】代替（{{ myGeneral === 'guanyu' ? '武圣' : '龙胆' }}）
        </button>
        <button class="btn" @click="respondSha(false)">不打出</button>
      </template>
      <template v-else-if="pend?.kind === 'shaAgain'">
        【青龙偃月刀】——【杀】被【闪】避掉，可对 {{ view.players[view.pending!.targetId!]!.name }} 再使用一张【杀】
        <button class="btn" :disabled="!shaMaterialNow()" @click="shaAgain(true)">再杀</button>
        <button class="btn" @click="shaAgain(false)">不杀</button>
      </template>
      <template v-else-if="pend?.kind === 'respondWuxie'">
        【{{ pend.trickSub ? disp(pend.trickSub) : '' }}】{{ pend.trickTargetId != null ? '对 ' + view.players[pend.trickTargetId]!.name + ' ' : '' }}结算 ——
        <button class="btn" :disabled="!hasCardInHand('wuxie')" @click="respondWuxie(true)">用【无懈可击】抵消</button>
        <button class="btn" @click="respondWuxie(false)">不抵消</button>
      </template>
      <template v-else-if="pend?.kind === 'respondTao'">
        {{ view.players[view.pending!.dyingId!]!.name }} 濒死 ——
        <button class="btn" :disabled="!hasCardInHand('tao')" @click="respondTao(true)">用【桃】</button>
        <button
          v-if="mySkills.includes('jijiu') && !hasCardInHand('tao') && jijiuMaterial()"
          class="btn"
          @click="respondTaoAlt()"
        >
          用【{{ disp(jijiuMaterial()!.sub) }}】代替（急救）
        </button>
        <button class="btn" @click="respondTao(false)">不用</button>
      </template>
      <template v-else-if="pend?.kind === 'pickCard'">
        <template v-if="pend.skillPick">
          【{{ SKILL_INFO[pend.skillPick.sub].display }}】——选择要拿走的牌：
        </template>
        <template v-else>
          【{{ pend.trickSub ? disp(pend.trickSub) : '' }}】——选择要{{ pend.trickSub === 'guohe' ? '弃置' : '获得' }}的牌：
        </template>
        <button
          v-for="o in pickOpts"
          :key="o.from"
          class="btn"
          @click="pickCard(o.from)"
        >
          {{ o.label }}
        </button>
      </template>
      <template v-else-if="pend?.kind === 'trigger' && pend.sub">
        <span class="skill-trigger">【{{ SKILL_INFO[pend.sub].display }}】{{ SKILL_INFO[pend.sub].desc }} ——</span>
        <button class="btn" @click="act({ type: 'respondTrigger', use: true })">发动</button>
        <button class="btn" @click="act({ type: 'respondTrigger', use: false })">不发动</button>
      </template>
      <template v-else-if="pend?.kind === 'skillCard' && pend.sub">
        <span class="skill-trigger">【{{ SKILL_INFO[pend.sub].display }}】—— 点一张手牌替换判定牌</span>
        <button class="btn" @click="act({ type: 'respondSkillCard', cardId: null })">不替换</button>
      </template>
      <template v-else-if="pend?.kind === 'guanxing'">
        【观星】—— 点牌置于牌堆顶（先点的先摸到），未点的置牌堆底（已选 {{ guanxingPick.length }}/{{ pend.guanxingCards?.length ?? 0 }}）
        <button class="btn" @click="act({ type: 'respondGuanxing', topIds: [...guanxingPick] })">确认观星</button>
        <div class="guanxing-row">
          <div
            v-for="(c, gi) in pend.guanxingCards ?? []"
            :key="c.id"
            class="card gx-chip"
            :class="{ selected: guanxingPick.includes(c.id) }"
            @click="onGuanxingClick(c)"
          >
            <div class="cname">{{ disp(c.sub) }}</div>
            <div class="csuit">{{ c.suit }}{{ c.rank }}</div>
            <div class="gx-order" v-if="guanxingPick.includes(c.id)">第{{ guanxingPick.indexOf(c.id) + 1 }}</div>
          </div>
        </div>
      </template>
      <template v-else-if="pend?.kind === 'liuli'">
        【流离】—— {{ !liuliPick ? '点一张手牌弃置，把【杀】转移给距离1以内的男性' : `已选【${disp(liuliPick.sub)}】——点要转移给的男性目标` }}
        <button class="btn" @click="act({ type: 'respondLiuli', cardId: null })">不发动</button>
      </template>
      <template v-else-if="pend?.kind === 'discard'">
        {{ pend.cixiong ? '【雌雄双股剑】——弃置一张手牌令【杀】无效' : `请弃置 ${discardCount} 张手牌` }}（已选 {{ discardSel.length }} 张）
        <button class="btn" :disabled="!canConfirmDiscard" @click="act({ type: 'discard', cardIds: [...discardSel] })">
          确认弃牌
        </button>
      </template>
      <template v-else-if="thinking"><span class="thinking">🤔 {{ waitingName }} 思考中…</span></template>
      <template v-else>等待 {{ waitingName }} 行动…</template>
    </section>

    <section class="hand">
      <div
        v-for="c in handSorted"
        :key="c.id"
        :data-cid="c.id"
        class="card"
        :class="[c.sub, CARD_INFO[c.sub].kind, { selected: selected?.cardId === c.id || selected2?.id === c.id || discardSel.includes(c.id) || guanshiSel.includes(c.id) || activeSel.includes(c.id) || guanxingPick.includes(c.id) || lijianCard?.id === c.id, clickable: !!pend }]"
        @click="onCardClick(c)"
      >
        <div class="cname" :class="{ long: disp(c.sub).length > 2 }">{{ disp(c.sub) }}</div>
        <div class="csuit">{{ c.suit }}{{ c.rank }}</div>
        <div v-if="skillHint(c)" class="card-skill">{{ skillHint(c) }}</div>
      </div>
      <div v-if="!me" class="spectating">（观战中）</div>
    </section>

    <section class="log">
      <div v-for="(e, i) in view.log.slice(-40)" :key="i" class="logev">{{ evText(e) }}</div>
    </section>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
}
body {
  background: #171a21;
  color: #d8dee9;
  font-family: 'Microsoft YaHei', system-ui, sans-serif;
}
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
h1 {
  font-size: 20px;
}
.m1 {
  color: #e5b567;
  font-size: 14px;
  border: 1px solid #e5b567;
  border-radius: 4px;
  padding: 1px 6px;
  vertical-align: middle;
}
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.seed {
  color: #6b7280;
  font-size: 12px;
}
.badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 13px;
}
.id-zhu {
  background: #7a3b12;
  color: #ffd9a8;
}
.id-zhong {
  background: #1e4d2b;
  color: #b8f0c8;
}
.id-fan {
  background: #5c1f1f;
  color: #ffc4c4;
}
.id-nei {
  background: #3a2d5c;
  color: #d3c4ff;
}
.dead-badge {
  background: #333;
  color: #999;
}
.btn {
  background: #2d6cdf;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
.btn.ghost {
  background: transparent;
  border: 1px solid #4a5160;
  color: #9aa3b2;
}
.btn:disabled {
  background: #444;
  color: #888;
  cursor: not-allowed;
}
.winner {
  text-align: center;
  font-size: 22px;
  padding: 10px;
  background: #2c2413;
  border: 1px solid #e5b567;
  border-radius: 8px;
  margin-bottom: 8px;
}
.replay-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: #9aa3b2;
  margin-bottom: 12px;
}
.pid {
  font-size: 12px;
  color: #8b93a3;
  margin: 4px 0;
}
.hp {
  font-size: 13px;
  letter-spacing: 2px;
  margin-bottom: 4px;
}
.heart {
  color: #3a3f4a;
}
.heart.on {
  color: #e05555;
}
.skill {
  font-size: 11px;
  color: #7fb8e0;
  min-height: 15px;
}
.skill.skill-on {
  color: #e5b567;
  font-weight: bold;
}
.card {
  position: relative;
}
.card-skill {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #7a3b12;
  color: #ffd9a8;
  font-size: 10px;
  border-radius: 6px;
  padding: 0 5px;
  border: 1px solid #e5b567;
  pointer-events: none;
}
.equips {
  font-size: 11px;
  color: #7fd08a;
  min-height: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.judgs {
  font-size: 11px;
  color: #e5b567;
  min-height: 15px;
}
.handcount {
  font-size: 12px;
  color: #8b93a3;
}
.prompt {
  background: #22262f;
  border-radius: 8px;
  padding: 12px;
  min-height: 46px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.hand {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 100px;
  margin-bottom: 12px;
}
.card {
  width: 68px;
  height: 96px;
  border-radius: 8px;
  border: 2px solid #444;
  background: #2b303b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.card.clickable {
  cursor: pointer;
}
.card.selected {
  border-color: #e5b567;
  transform: translateY(-10px);
}
.card .cname {
  font-size: 26px;
  font-weight: bold;
  padding: 0 4px;
  text-align: center;
}
.card .cname.long {
  font-size: 15px;
  line-height: 1.3;
}
.card.sha .cname {
  color: #e07070;
}
.card.shan .cname {
  color: #7aa5e0;
}
.card.tao .cname {
  color: #7fd08a;
}
.card.trick .cname {
  color: #c39bff;
}
.card.equip .cname {
  color: #e5b567;
}
.csuit {
  color: #8b93a3;
  font-size: 13px;
  margin-top: 6px;
}
.spectating {
  color: #6b7280;
  align-self: center;
}
.skill-trigger {
  color: #e5b567;
  font-weight: bold;
}
.thinking {
  color: #e5b567;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
/* —— 环形桌位（ADR-0009）：自己居下，四家环绕，中央信息区 —— */
.table {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin: 0 auto 12px;
  aspect-ratio: 16 / 10;
}
.arrow-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 8;
  overflow: visible;
}
.arrow-line {
  stroke: #e05555;
  stroke-width: 3;
  stroke-dasharray: 6 4;
  animation: arrowFade 0.7s ease-out forwards;
}
@keyframes arrowFade {
  0% {
    opacity: 0;
    stroke-dashoffset: 20;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    stroke-dashoffset: 0;
  }
}
.seat {
  position: absolute;
  width: 148px;
  background: #22262f;
  border: 2px solid #2c313c;
  border-radius: 8px;
  padding: 6px 8px;
  text-align: center;
  z-index: 2;
}
.seat.pos-bottom {
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
}
.seat.pos-left {
  left: 0;
  top: 50%;
  transform: translateY(-50%);
}
.seat.pos-right {
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}
.seat.pos-top-left {
  left: 15%;
  top: 0;
}
.seat.pos-top-right {
  right: 15%;
  top: 0;
}
.seat.turn {
  border-color: #e5b567;
  box-shadow: 0 0 10px rgba(229, 181, 103, 0.45);
}
.seat.me {
  background: #232b3a;
}
.seat.dead {
  opacity: 0.4;
}
.seat.dead .pname {
  text-decoration: line-through;
}
.seat.targetable {
  border-color: #e05555;
  cursor: pointer;
}
.phead {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  flex: 0 0 auto;
}
.pname {
  font-size: 15px;
  font-weight: bold;
}
.you {
  background: #2d6cdf;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 4px;
  margin-left: 2px;
}
.sex {
  font-size: 12px;
  opacity: 0.65;
  margin-left: 2px;
}
.sex-f {
  color: #e88ab0;
  opacity: 1;
}
.guanxing-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.gx-chip {
  width: 64px;
  height: 88px;
  position: relative;
  cursor: pointer;
}
.gx-order {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: #7fd37f;
}
.codex {
  border: 1px solid #2a3040;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  font-size: 12px;
  background: #1c2029;
}
.codex-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.codex-name {
  font-weight: bold;
  white-space: nowrap;
}
.codex-f {
  color: #e88ab0;
}
.codex-skills {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #9aa3b2;
}
.codex-skill b {
  color: #c8d2e0;
}
.stats-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.stats-line {
  margin-top: 8px;
  font-size: 12px;
  color: #9aa3b2;
}
.stats-side {
  margin-right: 8px;
}
.stats-table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 12px;
}
.stats-table th,
.stats-table td {
  border-bottom: 1px solid #2a3040;
  padding: 3px 6px;
  text-align: left;
}
.stats-table th {
  color: #7a8494;
  font-weight: normal;
}
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #8b93a3;
  font-size: 13px;
  line-height: 1.5;
  z-index: 1;
}
.pile {
  display: inline-block;
  margin: 0 6px;
}
.center-turn {
  color: #e5b567;
}
.center-phase {
  color: #6b7280;
  font-size: 12px;
}
.float-layer {
  position: absolute;
  left: 0;
  right: 0;
  top: 10%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 6;
}
.float {
  font-size: 13px;
  font-weight: bold;
  white-space: nowrap;
  animation: floatUp 1.5s ease-out forwards;
  text-shadow: 0 1px 3px #000;
}
.float-card {
  color: #ffd9a8;
}
.float-dmg {
  color: #ff6b6b;
  font-size: 16px;
}
.float-heal {
  color: #7fd08a;
}
.float-death {
  color: #999;
}
.float-judge {
  color: #c39bff;
}
.float-wuxie {
  color: #7fb8e0;
}
@keyframes floatUp {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  20% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-18px);
  }
}
.seat.flash-dmg {
  animation: flashDmg 0.8s ease-out;
}
@keyframes flashDmg {
  0%,
  100% {
    box-shadow: none;
  }
  30% {
    box-shadow: 0 0 14px 4px #e05555 inset;
  }
}
.seat.flash-dying {
  animation: flashDying 0.8s ease-out;
}
@keyframes flashDying {
  0%,
  100% {
    box-shadow: none;
  }
  50% {
    box-shadow: 0 0 18px 6px #ff2222 inset;
  }
}
.log {
  background: #1b1f27;
  border: 1px solid #2c313c;
  border-radius: 8px;
  padding: 8px 12px;
  max-height: 180px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: #9aa3b2;
}
</style>
