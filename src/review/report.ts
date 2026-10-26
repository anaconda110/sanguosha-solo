// M24 确定性复盘报告：唯一输入是 seed + 完整动作日志。
// 报告不记录生成时间等易变字段；同一输入的 JSON 必须逐字节稳定。
import { setup } from '../engine/setup';
import { step } from '../engine/step';
import type {
  Action,
  CardSub,
  EquipSlot,
  GameEvent,
  GameState,
  GeneralSub,
  Identity,
  Phase,
  SkillSub,
  WinSide,
} from '../engine/types';

export const REPLAY_REPORT_SCHEMA = 'sanguosha-solo/replay-report';
export const REPLAY_REPORT_VERSION = 1;

export type ReplayPerspectiveMode = 'player' | 'spectator';
export type ReplayResult = 'victory' | 'defeat' | 'draw';

export interface ReplaySource {
  seed: number;
  /** 人类座次；观战为 null */
  humanId: number | null;
  spectate: boolean;
  actionLog: Action[];
}

export interface ReplayPlayerStats {
  damageDealt: number;
  damageTaken: number;
  healing: number;
  dying: number;
  deaths: number;
  kills: number;
  skillActivations: number;
  abilityActivations: number;
}

export interface ReplayPlayer {
  id: number;
  name: string;
  general: GeneralSub;
  identity: Identity;
  alive: boolean;
  hp: number;
  maxHp: number;
  handCount: number;
  equipment: Partial<Record<EquipSlot, CardSub>>;
  judgements: CardSub[];
  result: ReplayResult | null;
  stats: ReplayPlayerStats;
}

export interface ReplayTimelineEvent {
  /** state.log 中的一基下标 */
  seq: number;
  /** 一基回合序号；初始回合为 1 */
  turn: number;
  event: GameEvent;
}

export interface ReplayReport {
  schema: typeof REPLAY_REPORT_SCHEMA;
  version: typeof REPLAY_REPORT_VERSION;
  source: ReplaySource;
  perspective: {
    mode: ReplayPerspectiveMode;
    humanId: number | null;
    identity: Identity | null;
    camp: WinSide | null;
    result: ReplayResult | null;
  };
  outcome: {
    winner: WinSide | null;
    turns: number;
    totalActions: number;
    totalEvents: number;
    finalPhase: Phase;
    finalTurnIdx: number;
  };
  totals: {
    damage: number;
    healing: number;
    dying: number;
    deaths: number;
    skillActivations: number;
    abilityActivations: number;
  };
  players: ReplayPlayer[];
  actionsByType: Array<{ type: Action['type']; count: number }>;
  skills: Array<{ id: SkillSub; count: number }>;
  abilities: Array<{ id: CardSub; count: number }>;
  timeline: ReplayTimelineEvent[];
}

const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'jia1ma', 'jian1ma'];

/** 固定顺序用于稳定序列化；只输出本局实际出现的动作类型。 */
export const ACTION_TYPE_ORDER: Array<Action['type']> = [
  'playSha',
  'playTao',
  'playTrick',
  'playEquip',
  'useSkill',
  'respondFanjian',
  'respondWugu',
  'respondJiedao',
  'respondLord',
  'respondDraw',
  'respondTuxi',
  'respondYiji',
  'endPlay',
  'respondShan',
  'respondSha',
  'respondWuxie',
  'respondTao',
  'respondBagua',
  'respondTrigger',
  'respondSkillCard',
  'respondCixiong',
  'respondGuanshi',
  'respondGuanxing',
  'respondLiuli',
  'shaAgain',
  'pickCard',
  'discard',
];

/** 进入关键时间线的事件类型。普通出牌不逐条展开，其效果会在伤害/技能/能力事件中留下记录。 */
export const REPLAY_KEY_EVENT_TYPES: ReadonlySet<GameEvent['t']> = new Set([
  'damage',
  'heal',
  'dying',
  'death',
  'rewardDraw',
  'penaltyDiscard',
  'negate',
  'judge',
  'judgeModify',
  'moveJudgement',
  'skill',
  'ability',
  'gameOver',
]);

function emptyStats(): ReplayPlayerStats {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healing: 0,
    dying: 0,
    deaths: 0,
    kills: 0,
    skillActivations: 0,
    abilityActivations: 0,
  };
}

function sideCamp(identity: Identity): Exclude<WinSide, 'draw'> {
  if (identity === 'zhu' || identity === 'zhong') return 'zhu';
  return identity;
}

function resultOf(identity: Identity | null, winner: WinSide | null): ReplayResult | null {
  if (!identity || !winner) return null;
  if (winner === 'draw') return 'draw';
  return sideCamp(identity) === winner ? 'victory' : 'defeat';
}

/** 仅用于构建报告与复现测试；失败时抛出带动作序号的确定性错误。 */
export function replayActionLog(source: ReplaySource): GameState {
  let state = setup(source.seed);
  for (let i = 0; i < source.actionLog.length; i++) {
    if (state.winner) {
      throw new Error(`第 ${i + 1} 个动作发生前对局已结束`);
    }
    if (!state.pending) {
      throw new Error(`第 ${i + 1} 个动作前没有待决策询问`);
    }
    try {
      state = step(state, source.actionLog[i]!);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${i + 1} 个动作重演失败：${message}`);
    }
  }
  return state;
}

/**
 * 从 seed + actionLog 重演生成结构化报告。
 * 输入数组先深拷贝，确保后续 UI 状态变化不会污染已生成报告。
 */
export function buildReplayReport(input: ReplaySource): ReplayReport {
  const actionLog = input.actionLog.map(action => structuredClone(action));
  const source: ReplaySource = {
    seed: input.seed,
    humanId: input.humanId,
    spectate: input.spectate,
    actionLog,
  };
  const state = replayActionLog(source);
  const winner = state.winner?.side ?? null;

  const stats = new Map<number, ReplayPlayerStats>();
  for (const p of state.players) stats.set(p.id, emptyStats());
  const skillCounts = new Map<SkillSub, number>();
  const abilityCounts = new Map<CardSub, number>();
  const actionCounts = new Map<Action['type'], number>();
  for (const action of actionLog) actionCounts.set(action.type, (actionCounts.get(action.type) ?? 0) + 1);

  for (const event of state.log) {
    switch (event.t) {
      case 'damage': {
        const target = stats.get(event.player);
        if (target) target.damageTaken += event.amount;
        if (!event.loss && event.source != null) {
          const sourceStats = stats.get(event.source);
          if (sourceStats) sourceStats.damageDealt += event.amount;
        }
        break;
      }
      case 'heal': {
        const target = stats.get(event.player);
        if (target) target.healing += event.amount;
        break;
      }
      case 'dying': {
        const target = stats.get(event.player);
        if (target) target.dying += 1;
        break;
      }
      case 'death': {
        const target = stats.get(event.player);
        if (target) target.deaths += 1;
        if (event.killer != null) {
          const killer = stats.get(event.killer);
          if (killer) killer.kills += 1;
        }
        break;
      }
      case 'skill': {
        skillCounts.set(event.sub, (skillCounts.get(event.sub) ?? 0) + 1);
        const actor = stats.get(event.player);
        if (actor) actor.skillActivations += 1;
        break;
      }
      case 'ability': {
        abilityCounts.set(event.sub, (abilityCounts.get(event.sub) ?? 0) + 1);
        const actor = stats.get(event.player);
        if (actor) actor.abilityActivations += 1;
        break;
      }
      default:
        break;
    }
  }

  const players: ReplayPlayer[] = state.players.map(p => {
    const equipment: Partial<Record<EquipSlot, CardSub>> = {};
    for (const slot of EQUIP_SLOTS) {
      const card = p.equipment[slot];
      if (card) equipment[slot] = card.sub;
    }
    return {
      id: p.id,
      name: p.name,
      general: p.general,
      identity: p.identity,
      alive: p.alive,
      hp: p.hp,
      maxHp: p.maxHp,
      handCount: p.hand.length,
      equipment,
      judgements: p.judgements.map(card => card.asSub ?? card.sub),
      result: resultOf(p.identity, winner),
      stats: stats.get(p.id)!,
    };
  });

  const humanPlayer = source.humanId == null ? undefined : state.players[source.humanId];
  const humanIdentity = humanPlayer?.identity ?? null;
  const humanCamp = humanIdentity ? sideCamp(humanIdentity) : null;
  const actionsByType: ReplayReport['actionsByType'] = ACTION_TYPE_ORDER
    .map(type => ({ type, count: actionCounts.get(type) ?? 0 }))
    .filter(row => row.count > 0);

  const timeline: ReplayTimelineEvent[] = [];
  let turn = 0;
  for (let i = 0; i < state.log.length; i++) {
    const event = state.log[i]!;
    if (event.t === 'turnStart') {
      turn += 1;
      continue;
    }
    if (REPLAY_KEY_EVENT_TYPES.has(event.t)) {
      timeline.push({ seq: i + 1, turn: Math.max(1, turn), event: structuredClone(event) });
    }
  }

  return {
    schema: REPLAY_REPORT_SCHEMA,
    version: REPLAY_REPORT_VERSION,
    source,
    perspective: {
      mode: source.spectate || source.humanId == null ? 'spectator' : 'player',
      humanId: source.humanId,
      identity: humanIdentity,
      camp: humanCamp,
      result: humanIdentity ? resultOf(humanIdentity, winner) : null,
    },
    outcome: {
      winner,
      turns: state.log.filter(event => event.t === 'turnStart').length,
      totalActions: actionLog.length,
      totalEvents: state.log.length,
      finalPhase: state.phase,
      finalTurnIdx: state.turnIdx,
    },
    totals: {
      damage: players.reduce((sum, p) => sum + p.stats.damageTaken, 0),
      healing: players.reduce((sum, p) => sum + p.stats.healing, 0),
      dying: players.reduce((sum, p) => sum + p.stats.dying, 0),
      deaths: players.reduce((sum, p) => sum + p.stats.deaths, 0),
      skillActivations: players.reduce((sum, p) => sum + p.stats.skillActivations, 0),
      abilityActivations: players.reduce((sum, p) => sum + p.stats.abilityActivations, 0),
    },
    players,
    actionsByType,
    skills: Array.from(skillCounts, ([id, count]) => ({ id, count })),
    abilities: Array.from(abilityCounts, ([id, count]) => ({ id, count })),
    timeline,
  };
}
