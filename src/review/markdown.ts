// M24 Markdown 交付层：只读取 ReplayReport + 质检结果，不重新解释引擎状态。
import { CARD_INFO, GENERAL_INFO, IDENTITY_NAMES, SKILL_INFO } from '../engine/types';
import type { Action } from '../engine/types';
import { SIDE_NAMES, disp } from '../composables/labels';
import type { ReplayQualityReport } from './quality';
import type { ReplayReport, ReplayResult } from './report';
import { describeGameEvent } from './event-text';
import { buildReviewHighlights } from './highlights';

const RESULT_NAMES: Record<ReplayResult, string> = {
  victory: '胜利',
  defeat: '失败',
  draw: '平局',
};

const ACTION_NAMES: Record<Action['type'], string> = {
  playSha: '使用杀',
  playTao: '使用桃',
  playTrick: '使用锦囊',
  playEquip: '装备',
  useSkill: '发动技能',
  respondFanjian: '反间猜花色',
  respondWugu: '五谷选牌',
  respondJiedao: '借刀应答',
  respondLord: '主公技求援',
  respondDraw: '摸牌抉择',
  respondTuxi: '突袭选人',
  respondYiji: '遗计分配',
  endPlay: '结束出牌',
  respondShan: '闪应答',
  respondSha: '杀应答',
  respondWuxie: '无懈应答',
  respondTao: '桃应答',
  respondBagua: '八卦判定',
  respondTrigger: '触发技应答',
  respondSkillCard: '技能选牌',
  respondCixiong: '雌雄选择',
  respondGuanshi: '贯石斧弃牌',
  respondGuanxing: '观星排序',
  respondLiuli: '流离选择',
  shaAgain: '青龙再杀',
  pickCard: '结算选牌',
  discard: '弃牌',
};

function cell(value: unknown): string {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function equipmentText(equipment: ReplayReport['players'][number]['equipment']): string {
  const names = (['weapon', 'shield', 'jia1ma', 'jian1ma'] as const)
    .map(slot => equipment[slot])
    .filter((sub): sub is NonNullable<typeof sub> => sub != null)
    .map(disp);
  return names.length > 0 ? names.join('、') : '无';
}

function perspectiveText(report: ReplayReport): string {
  if (report.perspective.mode === 'spectator') return '观战（五名 AI 自战）';
  const player = report.players.find(p => p.id === report.perspective.humanId);
  return player ? `玩家座次 ${player.id} · ${player.name}【${IDENTITY_NAMES[player.identity]}】` : '玩家视角（座次异常）';
}

export function renderReplayMarkdown(report: ReplayReport, quality: ReplayQualityReport): string {
  const lines: string[] = [];
  lines.push('# 三国杀对局复盘');
  lines.push('');
  lines.push(`> 种子：\`${report.source.seed}\` ｜ ${perspectiveText(report)}`);
  lines.push('> 本报告由 seed + 动作日志确定性重演生成；不含生成时间等易变字段。');
  lines.push('');
  lines.push('## 对局结果');
  lines.push('');
  lines.push(`- **胜方**：${report.outcome.winner ? SIDE_NAMES[report.outcome.winner] : '未终局'}`);
  if (report.perspective.result) {
    lines.push(`- **玩家结果**：${RESULT_NAMES[report.perspective.result]}`);
  }
  lines.push(`- **回合数**：${report.outcome.turns}`);
  lines.push(`- **动作数**：${report.outcome.totalActions}`);
  lines.push(`- **事件数**：${report.outcome.totalEvents}`);
  lines.push(`- **伤害/体力损失**：${report.totals.damage}`);
  lines.push(`- **回复**：${report.totals.healing}`);
  lines.push(`- **濒死 / 阵亡**：${report.totals.dying} / ${report.totals.deaths}`);
  if (report.actionsByType.length > 0) {
    lines.push(`- **动作构成**：${report.actionsByType.map(row => `${ACTION_NAMES[row.type]} ×${row.count}`).join('、')}`);
  }
  lines.push('');
  lines.push('## 复盘亮点');
  lines.push('');
  for (const highlight of buildReviewHighlights(report)) {
    const seq = highlight.seq == null ? '' : `（事件 #${highlight.seq}）`;
    lines.push(`- **${highlight.label}**：${highlight.text}${seq}`);
  }
  lines.push('');
  lines.push('## 身份与最终状态');
  lines.push('');
  lines.push('| 座次 | 玩家 | 武将 | 身份 | 结果 | 体力 | 手牌 | 装备 | 判定区 |');
  lines.push('| ---: | --- | --- | --- | --- | ---: | ---: | --- | --- |');
  for (const player of report.players) {
    lines.push(
      `| ${player.id} | ${cell(player.name)} | ${cell(GENERAL_INFO[player.general].display)} | ${IDENTITY_NAMES[player.identity]} | ${player.result ? RESULT_NAMES[player.result] : '-'} | ${player.hp}/${player.maxHp}${player.alive ? '' : '（阵亡）'} | ${player.handCount} | ${cell(equipmentText(player.equipment))} | ${cell(player.judgements.map(disp).join('、') || '无')} |`,
    );
  }
  lines.push('');
  lines.push('## 玩家数据');
  lines.push('');
  lines.push('| 玩家 | 造成伤害 | 承受伤害/损失 | 回复 | 濒死 | 击杀 | 阵亡 | 技能事件 | 能力事件 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const player of report.players) {
    lines.push(
      `| ${cell(player.name)} | ${player.stats.damageDealt} | ${player.stats.damageTaken} | ${player.stats.healing} | ${player.stats.dying} | ${player.stats.kills} | ${player.stats.deaths} | ${player.stats.skillActivations} | ${player.stats.abilityActivations} |`,
    );
  }
  lines.push('');
  lines.push('## 技能与能力触发');
  lines.push('');
  lines.push('> 只统计事件日志中可观测的发动；锁定技与部分用牌转换不发日志。');
  lines.push('');
  if (report.skills.length > 0) {
    lines.push(`- **技能**：${report.skills.map(row => `${SKILL_INFO[row.id].display} ×${row.count}`).join('、')}`);
  } else {
    lines.push('- **技能**：本局无日志记录');
  }
  if (report.abilities.length > 0) {
    lines.push(`- **装备/牌能力**：${report.abilities.map(row => `${CARD_INFO[row.id].display} ×${row.count}`).join('、')}`);
  } else {
    lines.push('- **装备/牌能力**：本局无日志记录');
  }
  lines.push('');
  lines.push('## 关键时间线');
  lines.push('');
  if (report.timeline.length > 0) {
    for (const row of report.timeline) {
      lines.push(`- **回合 ${row.turn} · #${row.seq}** ${describeGameEvent(row.event, report.players)}`);
    }
  } else {
    lines.push('- 无关键事件');
  }
  lines.push('');
  lines.push('## 自动质检');
  lines.push('');
  lines.push(`- 结果：${quality.passed ? '通过' : '未通过'}`);
  lines.push(`- 检查项：${quality.checks.length} 项，失败 ${quality.checks.filter(check => !check.passed).length} 项`);
  if (quality.warnings.length > 0) {
    for (const warning of quality.warnings) lines.push(`- 提示：${warning}`);
  }
  lines.push('');
  return lines.join('\n');
}
