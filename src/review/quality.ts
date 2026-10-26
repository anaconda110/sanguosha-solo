// M24 报告质检：与构建过程独立地再次重演，并检查终局、结构、计数与时间线索引。
// 质检错误会阻止 Markdown 交付；warning 只提示覆盖缺口，不阻断。
import type { Action, GameEvent, GameState, SkillSub, CardSub } from '../engine/types';
import {
  ACTION_TYPE_ORDER,
  REPLAY_KEY_EVENT_TYPES,
  REPLAY_REPORT_SCHEMA,
  REPLAY_REPORT_VERSION,
  replayActionLog,
  type ReplayReport,
} from './report';

export interface ReplayQualityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ReplayQualityReport {
  passed: boolean;
  checks: ReplayQualityCheck[];
  warnings: string[];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectedSkills(log: GameEvent[]): Array<{ id: SkillSub; count: number }> {
  const counts = new Map<SkillSub, number>();
  for (const event of log) {
    if (event.t === 'skill') counts.set(event.sub, (counts.get(event.sub) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({ id, count }));
}

function expectedAbilities(log: GameEvent[]): Array<{ id: CardSub; count: number }> {
  const counts = new Map<CardSub, number>();
  for (const event of log) {
    if (event.t === 'ability') counts.set(event.sub, (counts.get(event.sub) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({ id, count }));
}

function expectedActions(actions: Action[]): Array<{ type: Action['type']; count: number }> {
  const counts = new Map<Action['type'], number>();
  for (const action of actions) counts.set(action.type, (counts.get(action.type) ?? 0) + 1);
  return ACTION_TYPE_ORDER
    .map(type => ({ type, count: counts.get(type) ?? 0 }))
    .filter(row => row.count > 0);
}

function expectedTotals(log: GameEvent[]): ReplayReport['totals'] {
  const totals: ReplayReport['totals'] = {
    damage: 0,
    healing: 0,
    dying: 0,
    deaths: 0,
    skillActivations: 0,
    abilityActivations: 0,
  };
  for (const event of log) {
    if (event.t === 'damage') totals.damage += event.amount;
    else if (event.t === 'heal') totals.healing += event.amount;
    else if (event.t === 'dying') totals.dying += 1;
    else if (event.t === 'death') totals.deaths += 1;
    else if (event.t === 'skill') totals.skillActivations += 1;
    else if (event.t === 'ability') totals.abilityActivations += 1;
  }
  return totals;
}

function expectedTimeline(log: GameEvent[]): ReplayReport['timeline'] {
  const timeline: ReplayReport['timeline'] = [];
  let turn = 0;
  for (let i = 0; i < log.length; i++) {
    const event = log[i]!;
    if (event.t === 'turnStart') {
      turn += 1;
    } else if (REPLAY_KEY_EVENT_TYPES.has(event.t)) {
      timeline.push({ seq: i + 1, turn: Math.max(1, turn), event });
    }
  }
  return timeline;
}

function samePlayerSnapshot(report: ReplayReport, state: GameState): boolean {
  if (report.players.length !== state.players.length) return false;
  const byId = new Map(report.players.map(player => [player.id, player]));
  return state.players.every(player => {
    const recorded = byId.get(player.id);
    if (!recorded) return false;
    const equipment = Object.fromEntries(
      (['weapon', 'shield', 'jia1ma', 'jian1ma'] as const)
        .map(slot => [slot, player.equipment[slot]?.sub] as const)
        .filter(([, sub]) => sub != null),
    );
    return (
      recorded.name === player.name &&
      recorded.general === player.general &&
      recorded.identity === player.identity &&
      recorded.alive === player.alive &&
      recorded.hp === player.hp &&
      recorded.maxHp === player.maxHp &&
      recorded.handCount === player.hand.length &&
      sameJson(recorded.equipment, equipment) &&
      sameJson(recorded.judgements, player.judgements.map(card => card.asSub ?? card.sub))
    );
  });
}

export function inspectReplayReport(report: ReplayReport): ReplayQualityReport {
  const checks: ReplayQualityCheck[] = [];
  const warnings: string[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) => {
    checks.push({ id, label, passed, detail });
  };

  add('schema', '报告契约版本', report.schema === REPLAY_REPORT_SCHEMA && report.version === REPLAY_REPORT_VERSION,
    `schema=${report.schema}, version=${report.version}`);
  add('seed', '种子为整数', Number.isInteger(report.source.seed), `seed=${report.source.seed}`);
  add('source-log', '重演源包含动作日志', Array.isArray(report.source.actionLog), `动作 ${report.source.actionLog.length} 个`);
  add('source-counts', '源计数与日志一致',
    report.outcome.totalActions === report.source.actionLog.length,
    `摘要 ${report.outcome.totalActions} / 动作 ${report.source.actionLog.length}`);

  let state: GameState | null = null;
  try {
    state = replayActionLog(report.source);
    add('replay', '从 seed + actionLog 独立重演', true, `成功应用 ${report.source.actionLog.length} 个动作`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    add('replay', '从 seed + actionLog 独立重演', false, message);
  }

  if (state) {
    add('terminal', '重演到达终局', state.winner != null,
      state.winner ? `胜方 ${state.winner.side}` : '仍无胜方');
    add('winner', '胜方与终局一致', report.outcome.winner === (state.winner?.side ?? null),
      `报告 ${report.outcome.winner ?? 'null'} / 重演 ${state.winner?.side ?? 'null'}`);
    add('events', '事件总数与重演一致', report.outcome.totalEvents === state.log.length,
      `报告 ${report.outcome.totalEvents} / 重演 ${state.log.length}`);
    add('turns', '回合数与重演一致',
      report.outcome.turns === state.log.filter(event => event.t === 'turnStart').length,
      `报告 ${report.outcome.turns}`);

    const ids = report.players.map(player => player.id);
    const allPlayers = ids.length === state.players.length && new Set(ids).size === ids.length;
    add('players', '五名玩家完整且唯一', allPlayers, `记录 ${ids.length} 人`);
    add('player-state', '玩家最终状态与重演一致', samePlayerSnapshot(report, state),
      `记录 ${report.players.length} 人`);

    const human = report.source.humanId == null ? undefined : state.players[report.source.humanId];
    add('perspective-id', '人类座次与视角一致',
      report.perspective.mode === 'spectator'
        ? report.source.humanId == null
        : report.perspective.humanId === report.source.humanId && human != null,
      `mode=${report.perspective.mode}, humanId=${report.source.humanId}`);

    const damageFromLog = state.log.reduce(
      (sum, event) => sum + (event.t === 'damage' ? event.amount : 0), 0,
    );
    const playerDamage = report.players.reduce((sum, player) => sum + player.stats.damageTaken, 0);
    add('player-counters', '玩家伤害计数可汇总',
      damageFromLog === playerDamage && playerDamage === report.totals.damage,
      `事件 ${damageFromLog} / 玩家 ${playerDamage} / 摘要 ${report.totals.damage}`);
    add('totals', '摘要计数与事件日志一致', sameJson(report.totals, expectedTotals(state.log)),
      `伤害 ${report.totals.damage}，回复 ${report.totals.healing}`);
    add('action-types', '动作构成与动作日志一致',
      sameJson(report.actionsByType, expectedActions(report.source.actionLog)),
      `类型 ${report.actionsByType.length} 种`);
    add('skills', '技能计数与技能事件一致', sameJson(report.skills, expectedSkills(state.log)),
      `技能 ${report.skills.length} 种`);
    add('abilities', '能力计数与能力事件一致', sameJson(report.abilities, expectedAbilities(state.log)),
      `能力 ${report.abilities.length} 种`);
    add('timeline', '关键时间线与事件索引一致',
      sameJson(report.timeline, expectedTimeline(state.log)), `关键事件 ${report.timeline.length} 条`);
    add('timeline-nonempty', '关键时间线非空', report.timeline.length > 0,
      `${report.timeline.length} 条`);

    if (report.source.actionLog.length === 0) warnings.push('动作日志为空，无法形成可玩的复盘。');
    if (report.totals.skillActivations === 0) warnings.push('本局没有可观测的主动/触发技能事件；锁定技与部分用牌转换不发日志。');
    if (report.totals.abilityActivations === 0) warnings.push('本局没有可观测的装备/牌能力事件。');
  }

  return {
    passed: checks.every(check => check.passed),
    checks,
    warnings,
  };
}
