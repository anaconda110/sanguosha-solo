// M24 对外入口：生成报告并执行独立质检；错误级问题禁止生成 Markdown。
import { buildReplayReport, type ReplayReport, type ReplaySource } from './report';
import { inspectReplayReport, type ReplayQualityReport } from './quality';
import { renderReplayMarkdown } from './markdown';
import { buildReviewHighlights, type ReplayHighlight } from './highlights';

export interface ReplayArtifact {
  report: ReplayReport | null;
  quality: ReplayQualityReport;
  markdown: string;
}

export function createReplayArtifact(source: ReplaySource): ReplayArtifact {
  try {
    const report = buildReplayReport(source);
    const quality = inspectReplayReport(report);
    return {
      report,
      quality,
      markdown: quality.passed ? renderReplayMarkdown(report, quality) : '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      report: null,
      quality: {
        passed: false,
        checks: [{
          id: 'generation',
          label: '生成复盘报告',
          passed: false,
          detail: message,
        }],
        warnings: [],
      },
      markdown: '',
    };
  }
}

export { buildReplayReport, buildReviewHighlights, inspectReplayReport, renderReplayMarkdown };
export type { ReplayHighlight, ReplayReport, ReplayQualityReport, ReplaySource };
