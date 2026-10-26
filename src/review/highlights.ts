// 复盘亮点：只从 ReplayReport 的公开事件与统计中提炼稳定结论。
// 不读取非公开信息；同输入必须得到同输出。
import { IDENTITY_NAMES, type GameEvent } from '../engine/types';
import { SIDE_NAMES, disp } from '../composables/labels';
import type { ReplayPlayer, ReplayReport, ReplayTimelineEvent } from './report';

export interface ReplayHighlight {
  id: string;
  label: string;
  text: string;
  /** 对应 state.log 的一基事件序号；无单一来源时为 undefined。 */
  seq?: number;
}

function playerMap(report: ReplayReport): Map<number, ReplayPlayer> {
  return new Map(report.players.map(player => [player.id, player]));
}

function playerName(map: Map<number, ReplayPlayer>, id: number | undefined): string {
  if (id == null) return '未知角色';
  return map.get(id)?.name ?? `座次 ${id}`;
}

function tiedLeaders(
  report: ReplayReport,
  metric: (player: ReplayPlayer) => number,
): { ids: number[]; value: number } {
  let value = 0;
  for (const player of report.players) value = Math.max(value, metric(player));
  if (value <= 0) return { ids: [], value: 0 };
  return {
    ids: report.players
      .filter(player => metric(player) === value)
      .map(player => player.id)
      .sort((a, b) => a - b),
    value,
  };
}

function leaderText(
  map: Map<number, ReplayPlayer>,
  ids: number[],
  value: number,
  unit: string,
): string {
  const names = ids.map(id => playerName(map, id)).join('、');
  return ids.length > 1
    ? `${names} 并列最多，各 ${value}${unit}。`
    : `${names} 最多，共 ${value}${unit}。`;
}

function firstEvent(
  report: ReplayReport,
  predicate: (event: GameEvent) => boolean,
): ReplayTimelineEvent | undefined {
  return report.timeline.find(row => predicate(row.event));
}

function maxNegateChain(report: ReplayReport): { chain: number; rows: ReplayTimelineEvent[] } {
  const rows = report.timeline.filter(row => row.event.t === 'negate');
  const chain = rows.reduce(
    (max, row) => Math.max(max, row.event.t === 'negate' ? row.event.chain ?? 1 : 1),
    0,
  );
  return { chain, rows: rows.filter(row => row.event.t === 'negate' && (row.event.chain ?? 1) === chain) };
}

function negateText(
  map: Map<number, ReplayPlayer>,
  chain: number,
  rows: ReplayTimelineEvent[],
): string {
  const last = rows.at(-1)?.event;
  const target = last?.t === 'negate' && last.targetId != null
    ? `，涉及 ${playerName(map, last.targetId)} 的【${disp(last.sub)}】`
    : '';
  const resolution = chain % 2 === 0 ? '最终效果恢复' : '最终效果被抵消';
  return `公开日志记录到最长 ${chain} 次无懈结算${target}；${resolution}。`;
}

/** 固定顺序输出：输出伤害 → 回复 → 击杀 → 首次濒死 → 无懈链 → 胜负转折 → 口径。 */
export function buildReviewHighlights(report: ReplayReport): ReplayHighlight[] {
  const highlights: ReplayHighlight[] = [];
  const players = playerMap(report);

  const damage = tiedLeaders(report, player => player.stats.damageDealt);
  if (damage.ids.length > 0) {
    const row = firstEvent(
      report,
      event => event.t === 'damage' && event.source != null && damage.ids.includes(event.source),
    );
    highlights.push({
      id: 'damage-leader',
      label: '伤害最多',
      text: leaderText(players, damage.ids, damage.value, ' 点'),
      seq: row?.seq,
    });
  }

  const healing = tiedLeaders(report, player => player.stats.healing);
  if (healing.ids.length > 0) {
    const row = firstEvent(
      report,
      event => event.t === 'heal' && healing.ids.includes(event.player),
    );
    highlights.push({
      id: 'healing-leader',
      label: '回复最多',
      text: leaderText(players, healing.ids, healing.value, ' 点'),
      seq: row?.seq,
    });
  }

  const kills = tiedLeaders(report, player => player.stats.kills);
  if (kills.ids.length > 0) {
    const row = firstEvent(
      report,
      event => event.t === 'death' && event.killer != null && kills.ids.includes(event.killer),
    );
    highlights.push({
      id: 'kill-leader',
      label: '击杀最多',
      text: leaderText(players, kills.ids, kills.value, ' 次'),
      seq: row?.seq,
    });
  }

  const dying = firstEvent(report, event => event.t === 'dying');
  if (dying?.event.t === 'dying') {
    highlights.push({
      id: 'first-dying',
      label: '首次濒死',
      text: `${playerName(players, dying.event.player)} 首次进入濒死状态。`,
      seq: dying.seq,
    });
  }

  const negate = maxNegateChain(report);
  if (negate.chain > 0) {
    highlights.push({
      id: 'negate-chain',
      label: '最长无懈链',
      text: negateText(players, negate.chain, negate.rows),
      seq: negate.rows[0]?.seq,
    });
  }

  const gameOver = [...report.timeline].reverse().find(row => row.event.t === 'gameOver');
  if (gameOver?.event.t === 'gameOver') {
    const finalDeath = [...report.timeline]
      .reverse()
      .find(row => row.event.t === 'death' && row.seq < gameOver.seq);
    let text = `${SIDE_NAMES[gameOver.event.side]}最终落定。`;
    if (finalDeath?.event.t === 'death') {
      const killer = finalDeath.event.killer == null
        ? ''
        : `，由 ${playerName(players, finalDeath.event.killer)} 击杀`;
      text = `终局前最后一名阵亡者为 ${playerName(players, finalDeath.event.player)}（${IDENTITY_NAMES[finalDeath.event.identity]}）${killer}；${SIDE_NAMES[gameOver.event.side]}最终获胜。`;
    }
    highlights.push({
      id: 'turning-point',
      label: '胜负转折',
      text,
      seq: gameOver.seq,
    });
  }

  highlights.push({
    id: 'public-scope',
    label: '公开口径',
    text: `本摘要只统计 ${report.timeline.length} 条公开关键事件与终局快照，不读取非公开信息。`,
  });

  return highlights;
}
