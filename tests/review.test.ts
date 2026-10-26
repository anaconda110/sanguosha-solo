import { beforeAll, describe, expect, it } from 'vitest';
import { ruleAction } from '../src/ai/rule';
import { setup } from '../src/engine/setup';
import { step } from '../src/engine/step';
import type { GameState } from '../src/engine/types';
import {
  buildReplayReport,
  buildReviewHighlights,
  createReplayArtifact,
  inspectReplayReport,
  renderReplayMarkdown,
  type ReplaySource,
} from '../src/review';

let finalState: GameState;
let source: ReplaySource;

function playToEnd(seed: number): GameState {
  let state = setup(seed);
  for (let i = 0; !state.winner && i < 50000; i++) {
    const action = ruleAction(state, state.pending!.playerId);
    if (!action) throw new Error(`AI 无法应答 ${state.pending!.kind}`);
    state = step(state, action);
  }
  if (!state.winner) throw new Error(`seed ${seed} 未在 50000 步内终局`);
  return state;
}

beforeAll(() => {
  finalState = playToEnd(42);
  source = {
    seed: 42,
    humanId: 2,
    spectate: false,
    actionLog: finalState.actionLog,
  };
});

describe('M24 确定性复盘报告', () => {
  it('从终局动作日志生成通过质检的结构化报告与 Markdown', () => {
    const artifact = createReplayArtifact(source);

    expect(artifact.quality.passed).toBe(true);
    expect(artifact.quality.checks.every(check => check.passed)).toBe(true);
    expect(artifact.report).not.toBeNull();
    expect(artifact.report!.outcome.winner).toBe(finalState.winner!.side);
    expect(artifact.report!.outcome.totalActions).toBe(finalState.actionLog.length);
    expect(artifact.report!.outcome.totalEvents).toBe(finalState.log.length);
    expect(artifact.report!.players).toHaveLength(5);
    expect(artifact.report!.players.map(player => player.identity)).toEqual(
      finalState.players.map(player => player.identity),
    );
    expect(artifact.report!.timeline.length).toBeGreaterThan(0);
    expect(artifact.report!.timeline.at(-1)!.event.t).toBe('gameOver');
    expect(artifact.markdown).toContain('# 三国杀对局复盘');
    expect(artifact.markdown).toContain('种子：`42`');
    expect(artifact.markdown).toContain('## 自动质检');
    expect(artifact.markdown).toContain('结果：通过');
  });

  it('同一 seed + 动作日志生成逐字节一致的 JSON 与 Markdown', () => {
    const first = buildReplayReport(source);
    const second = buildReplayReport(source);
    const quality = inspectReplayReport(first);
    const markdownA = renderReplayMarkdown(first, quality);
    const markdownB = renderReplayMarkdown(second, quality);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(markdownB).toBe(markdownA);
  });

  it('独立质检能拦截被篡改的玩家终局状态', () => {
    const report = buildReplayReport(source);
    const corrupted = structuredClone(report);
    corrupted.players[0]!.hp += 1;

    const quality = inspectReplayReport(corrupted);

    expect(quality.passed).toBe(false);
    expect(quality.checks.find(check => check.id === 'player-state')!.passed).toBe(false);
  });

  it('终局后仍有多余动作时拒绝交付 Markdown', () => {
    const artifact = createReplayArtifact({
      ...source,
      actionLog: [...source.actionLog, { type: 'endPlay' }],
    });

    expect(artifact.report).toBeNull();
    expect(artifact.quality.passed).toBe(false);
    expect(artifact.quality.checks[0]!.id).toBe('generation');
    expect(artifact.markdown).toBe('');
  });
});

describe('M24 复盘亮点', () => {
  it('按固定顺序输出全部亮点，重复构建结果一致，并带可定位事件序号', () => {
    const report = buildReplayReport(source);
    for (const player of report.players) {
      player.stats.damageDealt = 0;
      player.stats.healing = 0;
      player.stats.kills = 0;
    }
    report.players[0]!.stats.damageDealt = 4;
    report.players[0]!.stats.healing = 3;
    report.players[0]!.stats.kills = 1;
    report.players[1]!.stats.damageDealt = 2;
    report.players[1]!.stats.healing = 1;
    report.timeline = [
      { seq: 11, turn: 1, event: { t: 'damage', player: 1, amount: 4, source: 0 } },
      { seq: 12, turn: 1, event: { t: 'heal', player: 0, amount: 3 } },
      { seq: 13, turn: 2, event: { t: 'death', player: 2, identity: 'fan', killer: 0 } },
      { seq: 14, turn: 2, event: { t: 'dying', player: 1 } },
      { seq: 15, turn: 3, event: { t: 'negate', player: 3, sub: 'shunshou', targetId: 1, chain: 1 } },
      { seq: 16, turn: 3, event: { t: 'negate', player: 4, sub: 'shunshou', targetId: 1, chain: 2 } },
      { seq: 17, turn: 3, event: { t: 'gameOver', side: 'fan' } },
    ];

    const first = buildReviewHighlights(report);
    const second = buildReviewHighlights(structuredClone(report));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.map(highlight => highlight.id)).toEqual([
      'damage-leader',
      'healing-leader',
      'kill-leader',
      'first-dying',
      'negate-chain',
      'turning-point',
      'public-scope',
    ]);
    expect(first.map(highlight => highlight.label)).toEqual([
      '伤害最多',
      '回复最多',
      '击杀最多',
      '首次濒死',
      '最长无懈链',
      '胜负转折',
      '公开口径',
    ]);
    expect(first.map(highlight => highlight.seq)).toEqual([11, 12, 13, 14, 16, 17, undefined]);
    expect(first.find(highlight => highlight.id === 'negate-chain')!.text).toContain('最长 2 次无懈结算');
    expect(first.find(highlight => highlight.id === 'negate-chain')!.text).toContain('最终效果恢复');
    expect(first.find(highlight => highlight.id === 'public-scope')!.text).toBe(
      '本摘要只统计 7 条公开关键事件与终局快照，不读取非公开信息。',
    );
    for (const highlight of first) {
      expect(highlight.text).not.toMatch(/隐藏手牌|AI 内部|权重|意图/);
    }
  });

  it('Markdown 报告包含复盘亮点章节与事件序号', () => {
    const report = buildReplayReport(source);
    const markdown = renderReplayMarkdown(report, inspectReplayReport(report));
    expect(markdown).toContain('## 复盘亮点');
    expect(markdown).toContain('**公开口径**');
    expect(markdown).toContain('不读取非公开信息');
  });
});
