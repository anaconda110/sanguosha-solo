// 对局状态域（M22 自 App.vue 迁出）：state/view/humanId/spectate/gameId 的唯一持有者。
// 引擎 state 是普通对象（非响应式），响应式投影是 view ref——每次 step 后整体替换，
// 模板里需要 state 的地方一律经 getState() 取当前绑定（勿缓存）。
// 依赖单向：anim ← game ← scheduler/interaction（后者经 App.vue 组合根的懒箭头注入，
// 避免模块环）。调度语义零改动：act/resetUi 末尾的 scheduleAi() 时序与原实现一致。
import { computed, ref } from 'vue';
import { setup } from '../engine/setup';
import { step } from '../engine/step';
import { GENERAL_SKILLS, type Action, type Card, type CardSub, type GameState, type Suit } from '../engine/types';
import { viewOf } from '../engine/view';
import { clearSave, hasSave, loadSave, saveGame } from '../persist';
import type { Ref } from 'vue';
import type { Settings } from '../settings';
import type { AnimationsApi } from './useAnimations';

export interface GameDeps {
  settings: Ref<Settings>;
  anim: AnimationsApi;
  /** 每次 act/resetUi 收尾调度 AI（组合根注入 scheduler.scheduleAi） */
  scheduleAi: () => void;
  /** act 后清空提示栏会话选择（组合根注入 interaction.resetAll） */
  resetSession: () => void;
}

// —— 环形桌位布局（ADR-0009）：自己固定下方，其余按顺时针座次环绕 ——
// 相对座次 offset ∈ {1,2,3,4}（1 = 下家）映射到方位；5 人局四家分别落 右/上右/上左/左
const OFFSET_POS: Record<number, string> = { 1: 'right', 2: 'top-right', 3: 'top-left', 4: 'left' };
/** 观战模式下的五个方位（自己也在环上，M15） */
const RING_POS = ['bottom', 'right', 'top-right', 'top-left', 'left'];

export function useGame(deps: GameDeps) {
  const { settings, anim, scheduleAi, resetSession } = deps;

  function randomSeed() {
    return Math.floor(Math.random() * 2 ** 31);
  }

  const seed = ref(randomSeed());
  /** 人类座次；-1 = 观战（5 名 AI 自战，M15） */
  const humanId = ref(Math.floor(Math.random() * 5));
  let state = setup(seed.value);
  let gameId = 0;
  const view = ref(viewOf(state, humanId.value));
  /** 观战模式：无真人手牌与询问，全部由 AI 应答 */
  const spectate = ref(false);
  /** 是否已有存档（"继续上局"按钮显隐） */
  const saveExists = ref(hasSave());
  /** 种子输入框（M15）：显示当前种子，可改后按此开局 */
  const seedInput = ref<number>(seed.value);
  /** 回放进度；null = 实时画面（ADR-0005：seed+动作重演） */
  const replayIdx = ref<number | null>(null);

  /** 引擎状态取用器：state 会被 step/newGame 换绑，任何地方都勿闭包捕获旧值 */
  const getState = (): GameState => state;
  const getGameId = () => gameId;

  // —— 环形座次：从我的座次出发，其余玩家的顺时针次序（死者也保持在环上，不跳动）；观战时即座次顺序 ——
  const ringOrder = computed(() => {
    const n = view.value.players.length;
    const out: number[] = [];
    if (spectate.value) {
      for (let i = 0; i < n; i++) out.push(i);
      return out;
    }
    for (let k = 1; k < n; k++) out.push((humanId.value + k) % n);
    return out;
  });
  const seatPos = computed<Record<number, string>>(() => {
    if (spectate.value) {
      const map: Record<number, string> = {};
      ringOrder.value.forEach((pid, i) => {
        map[pid] = RING_POS[i] ?? 'right';
      });
      return map;
    }
    const map: Record<number, string> = { [humanId.value]: 'bottom' };
    ringOrder.value.forEach((pid, i) => {
      map[pid] = OFFSET_POS[i + 1] ?? 'right';
    });
    return map;
  });
  const orderedPlayers = computed(() => {
    // 自下而上：底部自己、右侧、上右、上左、左侧（DOM 顺序仅作兜底，位置由 class 决定）
    const byId = new Map(view.value.players.map(p => [p.id, p]));
    const self = spectate.value ? undefined : byId.get(humanId.value);
    const rest = ringOrder.value.map(id => byId.get(id)!).filter(Boolean);
    return self ? [self, ...rest] : rest;
  });

  /** 统一的推进一步：step → 刷新视图 → 排队演出（手牌排序用 FLIP 过渡） */
  function applyStep(a: Action) {
    const before = state.log.length;
    const rects = anim.captureHandRects();
    state = step(state, a);
    refresh();
    void anim.flipHand(rects);
    anim.enqueueAnimations(before, state, replayIdx.value != null);
  }

  function refresh() {
    view.value = viewOf(state, humanId.value);
    persist();
  }

  /** 存档（M15）：每次状态推进后写一次；已终局则清档（不必续） */
  function persist() {
    if (state.winner) {
      clearSave();
      saveExists.value = false;
      return;
    }
    saveGame({ seed: seed.value, humanId: humanId.value, spectate: spectate.value, state });
    saveExists.value = true;
  }

  function act(a: Action) {
    replayIdx.value = null;
    applyStep(a);
    resetSession();
    refresh();
    scheduleAi();
  }

  /** 通用重置：新局与续局共用（不动 state/seed/humanId 的赋值） */
  function resetUi() {
    resetSession();
    replayIdx.value = null;
    anim.clearAndSync(state.log.length); // 新局不补演开场事件
    refresh();
    scheduleAi();
  }

  function newGame(opts: { spectate?: boolean } = {}) {
    gameId++;
    seed.value = randomSeed();
    spectate.value = opts.spectate ?? false;
    humanId.value = spectate.value ? -1 : Math.floor(Math.random() * 5);
    state = setup(seed.value);
    seedInput.value = seed.value;
    resetUi();
  }

  /** 按手填的种子开局（M15）：同种子 + 同操作 = 同结局（ADR-0002/0005） */
  function newGameWithSeed() {
    const n = Math.floor(Number(seedInput.value));
    if (!Number.isFinite(n) || n < 0) return;
    gameId++;
    seed.value = n | 0;
    spectate.value = false;
    humanId.value = Math.floor(Math.random() * 5);
    state = setup(seed.value);
    resetUi();
  }

  /** 续局（M15）：从 localStorage 恢复状态与日志，接着打 */
  function resumeGame() {
    const sv = loadSave();
    if (!sv) {
      saveExists.value = false;
      return;
    }
    gameId++;
    seed.value = sv.seed;
    spectate.value = sv.spectate ?? sv.humanId < 0;
    humanId.value = sv.spectate || sv.humanId < 0 ? -1 : sv.humanId;
    state = sv.state;
    resetUi();
  }

  /** 观战（M15）：五个座次全由 AI 应答，纯看戏 */
  function startSpectate() {
    newGame({ spectate: true });
  }

  // —— 视角派生 ——
  const me = computed(() => (spectate.value ? null : view.value.me));
  const meP = computed(() => view.value.players.find(p => p.id === humanId.value));
  /** 观战时没有"我的武将"——用主公代替，避免 computed 里索引 -1 崩溃 */
  const myGeneral = computed(() => state.players[Math.max(0, humanId.value)]!.general);
  /** 真人询问 = pending 落在我头上且我能看全自己的信息 */
  const pend = computed(() => {
    if (spectate.value) return null;
    const p = view.value.pending;
    return p && p.playerId === humanId.value && view.value.me ? p : null;
  });
  const replayTotal = computed(() => state.actionLog.length);

  const canSha = computed(
    () =>
      !view.value.playedSha ||
      meP.value?.equips.includes('liannu') ||
      myGeneral.value === 'zhangfei',
  );

  const isRedCard = (c: Card) => c.suit === ('♥' as Suit) || c.suit === ('♦' as Suit);

  /** 装备了丈八蛇矛：任意两张手牌可当杀 */
  const zhangbaOn = computed(() => meP.value?.equips.includes('zhangba') ?? false);

  // —— 离间（貂蝉）：可发动条件 ——
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

  const myGeneralState = computed(() => state.players[Math.max(0, humanId.value)]!);
  const mySkills = computed(() => (spectate.value ? [] : GENERAL_SKILLS[myGeneral.value]));

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

  /** 急救（华佗）：红色非桃手牌可当桃 */
  function jijiuMaterial(): Card | undefined {
    return me.value?.hand.find(c => c.sub !== 'tao' && isRedCard(c));
  }

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
    if (g === 'zhouyu')
      return (
        (me.value?.hand.length ?? 0) >= 1 &&
        view.value.players.some(p => p.alive && p.id !== humanId.value)
      );
    if (g === 'simayi' || g === 'caocao') return false; // 触发技：受伤时点亮
    return false;
  });

  /** 座次技能激活态：可主动发动的技能在素材可用时点亮 */
  function seatSkillOn(pid: number): boolean {
    if (pid === humanId.value) return mySkillReady.value;
    const p = view.value.players.find(x => x.id === pid);
    if (!p || !p.alive) return false;
    return p.general === 'zhangfei' || p.general === 'lvbu'; // 锁定技常时点亮
  }

  /** 回放跳转（M15 起支持拖动）：从 setup(seed) 重演 k 个动作；k 为 null = 退出回放 */
  function showReplay(k: number | null) {
    replayIdx.value = k;
    if (k == null) {
      refresh();
      return;
    }
    // 从当前位置向目标位置移动时，优先"就近重演"：向后跳直接续着现有快照走，
    // 只有向前跳（或退出回来）才从 setup 重来——O(步数) 的代价因此只在必要时付（ADR-0005）
    let s = setup(seed.value);
    for (let i = 0; i < k; i++) s = step(s, state.actionLog[i]!);
    view.value = viewOf(s, humanId.value);
  }

  return {
    seed,
    humanId,
    spectate,
    view,
    saveExists,
    seedInput,
    replayIdx,
    replayTotal,
    me,
    meP,
    myGeneral,
    myGeneralState,
    mySkills,
    pend,
    ringOrder,
    seatPos,
    orderedPlayers,
    getState,
    getGameId,
    refresh,
    applyStep,
    act,
    resetUi,
    newGame,
    newGameWithSeed,
    resumeGame,
    startSpectate,
    showReplay,
    canSha,
    zhangbaOn,
    aliveMales,
    lijianReady,
    mySkillReady,
    seatSkillOn,
    isRedCard,
    altShaMaterial,
    shaMaterialNow,
    hasCardInHand,
    jijiuMaterial,
  };
}

export type GameApi = ReturnType<typeof useGame>;
