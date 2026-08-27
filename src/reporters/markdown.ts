import { CATEGORY_LABELS, type Finding, type Severity } from '../types/core.js';
import type { Reporter } from './types.js';

/**
 * Markdown output, suitable for pasting into a pull-request comment or an
 * issue. Everything user-controlled is escaped so a filename or code snippet
 * cannot break out of its table cell or inject a link.
 */
export const markdownReporter: Reporter = (result) => {
  const lines: string[] = [];
  const verdictEmoji = { READY: '✅', 'NEEDS ATTENTION': '⚠️', 'NOT READY': '🛑' }[result.verdict];

  lines.push('# AI Shipcheck report');
  lines.push('');
  lines.push(
    `**${verdictEmoji} ${result.verdict}** — score **${result.score}/100** across ${result.coverage.checksRun} assessed checks`,
  );
  lines.push('');
  for (const reason of result.verdictReasons) lines.push(`- ${escapeMd(reason)}`);
  lines.push('');

  if (result.stats.truncated) {
    lines.push(
      '> **Partial scan.** A resource limit stopped the scan before the whole project was read, ' +
        'so this verdict covers only what was scanned.',
    );
    lines.push('');
  }

  lines.push(
    `Assessed ${result.coverage.checksRun} of ${result.coverage.checksTotal} checks across ` +
      `${result.coverage.categoriesAssessed} of ${result.coverage.categoriesTotal} categories ` +
      `(${result.coverage.checksNotApplicable} not applicable, ${result.coverage.checksUnassessed} not assessed).`,
  );
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Score | Findings |');
  lines.push('| --- | --- | --- |');
  for (const category of result.categories) {
    const score =
      category.status === 'assessed' ? `${category.score ?? 0}/100` : statusLabel(category.status);
    lines.push(
      `| ${CATEGORY_LABELS[category.category]} | ${score} | ${category.findingCount === 0 ? '—' : category.findingCount} |`,
    );
  }
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('No findings were reported.');
    lines.push('');
  } else {
    lines.push('## Findings');
    lines.push('');
    const grouped = groupBySeverity(result.findings);
    for (const [severity, findings] of grouped) {
      lines.push(`### ${severityLabel(severity)} (${findings.length})`);
      lines.push('');
      for (const finding of findings) {
        const first = finding.evidence[0];
        const location = first === undefined ? '' : ` — \`${escapeMd(first.file)}:${first.line}\``;
        lines.push(`#### ${escapeMd(finding.title)}${location}`);
        lines.push('');
        lines.push(
          `\`${escapeMd(finding.ruleId)}\` · severity **${finding.severity}** · confidence **${finding.confidence}**${finding.blocker === true ? ' · **blocker**' : ''}`,
        );
        lines.push('');
        lines.push(escapeMd(finding.explanation));
        lines.push('');
        if (finding.evidence.length > 0) {
          lines.push('```');
          for (const ev of finding.evidence.slice(0, 5)) {
            lines.push(`${ev.file}:${ev.line}:${ev.column}  ${ev.snippet}`);
          }
          lines.push('```');
          lines.push('');
        }
        lines.push(`**Fix:** ${escapeMd(finding.remediation)}`);
        lines.push('');
      }
    }
  }

  const unassessed = result.checks.filter((c) => c.status === 'unassessed');
  if (unassessed.length > 0) {
    lines.push('## Not assessed');
    lines.push('');
    for (const check of unassessed) {
      lines.push(
        `- \`${escapeMd(check.ruleId)}\` — ${escapeMd(check.reason ?? 'no reason recorded')}`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `Scanned ${result.stats.filesScanned} files in ${result.stats.durationMs} ms with ${result.tool.name} v${result.tool.version}. ` +
      'This is a static analysis of source code, not a security certification.',
  );
  lines.push('');
  return lines.join('\n');
};

function groupBySeverity(findings: readonly Finding[]): [Severity, Finding[]][] {
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const out: [Severity, Finding[]][] = [];
  for (const severity of order) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length > 0) out.push([severity, group]);
  }
  return out;
}

function severityLabel(severity: Severity): string {
  return {
    critical: '🛑 Critical',
    high: '🔴 High',
    medium: '🟠 Medium',
    low: '🟡 Low',
    info: 'ℹ️ Info',
  }[severity];
}

function statusLabel(status: 'assessed' | 'unassessed' | 'not-applicable'): string {
  return status === 'unassessed' ? 'not assessed' : 'n/a';
}

/**
 * Escape Markdown control characters and neutralise anything that could be
 * read as markup when the report is rendered on a platform that allows HTML.
 */
export function escapeMd(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (ch) => `\\${ch}`).replace(/\r?\n/g, ' ');
}
