import {
  CATEGORY_LABELS,
  type CategoryScore,
  type Finding,
  type ScanResult,
  type Severity,
} from '../types/core.js';
import { createPalette, padEnd, visibleLength, type Palette } from '../utils/color.js';
import type { Reporter } from './types.js';

/** Findings shown in full before the rest are summarised. */
const DETAILED_FINDINGS = 12;
const BAR_WIDTH = 16;

/**
 * The default terminal report.
 *
 * The layout is designed to answer three questions in the order a developer
 * actually asks them: can I ship this, what is the worst thing, and where is
 * it. Everything else is secondary and appears below the fold.
 */
export const prettyReporter: Reporter = (result, options) => {
  const c = createPalette(options.color);
  const out: string[] = [];
  const width = terminalWidth();

  out.push('');
  out.push(header(result, c, width));
  out.push('');

  if (!options.quiet) {
    out.push(profileLine(result, c));
    out.push('');
  }

  out.push(categoryTable(result.categories, c));
  out.push('');

  const anythingAssessed = result.categories.some((category) => category.status === 'assessed');
  if (result.findings.length === 0 && !anythingAssessed) {
    out.push(
      `  ${c.yellow('Nothing could be assessed.')} ${c.dim('No JavaScript or TypeScript project was found at this path.')}`,
    );
    out.push('');
  } else if (result.findings.length === 0) {
    out.push(`  ${c.green('No findings.')} ${c.dim('Every applicable check passed.')}`);
    out.push('');
  } else {
    out.push(c.bold('  Findings'));
    out.push('');
    const shown = result.findings.slice(0, DETAILED_FINDINGS);
    for (const finding of shown) out.push(renderFinding(finding, c, width));
    const remaining = result.findings.length - shown.length;
    if (remaining > 0) {
      out.push(
        `  ${c.dim(`… and ${remaining} more finding${remaining === 1 ? '' : 's'}. Run with --format json or --format markdown for the full list.`)}`,
      );
      out.push('');
    }
  }

  if (!options.quiet) {
    const notes = coverageNotes(result, c);
    if (notes.length > 0) {
      out.push(...notes);
      out.push('');
    }
  }

  out.push(verdictBlock(result, c, width));
  out.push('');

  if (!options.quiet && result.stats.warnings.length > 0) {
    out.push(c.dim(`  ${result.stats.warnings.length} warning(s) during the scan:`));
    for (const warning of result.stats.warnings.slice(0, 5)) {
      out.push(c.dim(`    · ${warning}`));
    }
    if (result.stats.warnings.length > 5) {
      out.push(c.dim(`    · … and ${result.stats.warnings.length - 5} more`));
    }
    out.push('');
  }

  out.push(
    c.dim(
      `  Scanned ${result.stats.filesScanned} files in ${formatDuration(result.stats.durationMs)} · ` +
        `${result.stats.rulesRun} checks run, ${result.stats.rulesSkipped} not applicable · ai-shipcheck v${result.tool.version}`,
    ),
  );
  out.push(c.dim('  Static analysis of source code - not a security certification.'));
  out.push('');

  return out.join('\n');
};

function header(result: ScanResult, c: Palette, width: number): string {
  const verdictText = ` ${result.verdict} `;
  const badge =
    result.verdict === 'READY'
      ? c.bold(c.bgGreen(c.black(verdictText)))
      : result.verdict === 'NEEDS ATTENTION'
        ? c.bold(c.bgYellow(c.black(verdictText)))
        : c.bold(c.bgRed(c.white(verdictText)));

  const assessed = result.categories.some((category) => category.status === 'assessed');
  const score = assessed ? `${result.score}/100` : '--/100';
  const scoreColored = !assessed
    ? c.dim(score)
    : result.score >= 85
      ? c.green(score)
      : result.score >= 60
        ? c.yellow(score)
        : c.red(score);

  const title = `  ${badge}  ${c.bold(scoreColored)} ${c.dim(assessed ? 'production readiness' : 'nothing assessed')}`;
  const name = result.profile.name ?? '';
  const right = name.length > 0 ? c.dim(name) : '';
  const pad = Math.max(1, width - visibleLength(title) - visibleLength(right) - 2);
  return `${title}${' '.repeat(pad)}${right}`;
}

function profileLine(result: ScanResult, c: Palette): string {
  const frameworks = result.profile.frameworks
    .filter((f) => f.confidence === 'high')
    .map((f) => f.name)
    .slice(0, 6);
  const parts: string[] = [];
  if (frameworks.length > 0) parts.push(frameworks.join(', '));
  if (result.profile.languages.length > 0) {
    parts.push(
      result.profile.languages
        .map((l) => (l === 'typescript' ? 'TypeScript' : 'JavaScript'))
        .join(' + '),
    );
  }
  if (result.profile.hasTests) parts.push('tests present');
  if (result.profile.hasCi) parts.push('CI configured');
  return `  ${c.dim('Detected:')} ${c.dim(parts.length > 0 ? parts.join(' · ') : 'no frameworks recognised')}`;
}

function categoryTable(categories: readonly CategoryScore[], c: Palette): string {
  const labelWidth = Math.max(...categories.map((cat) => CATEGORY_LABELS[cat.category].length));
  const lines: string[] = [];
  for (const category of categories) {
    const label = padEnd(CATEGORY_LABELS[category.category], labelWidth);
    if (category.status !== 'assessed' || category.score === null) {
      lines.push(
        `  ${c.dim(label)}  ${c.dim('·'.repeat(BAR_WIDTH))}  ${c.dim(category.status === 'unassessed' ? 'not assessed' : 'n/a')}`,
      );
      continue;
    }
    const score = category.score;
    const filled = Math.round((score / 100) * BAR_WIDTH);
    const colorise = score >= 85 ? c.green : score >= 60 ? c.yellow : c.red;
    const bar = colorise('█'.repeat(filled)) + c.dim('░'.repeat(BAR_WIDTH - filled));
    const count =
      category.findingCount === 0
        ? c.dim('clean')
        : `${category.findingCount} finding${category.findingCount === 1 ? '' : 's'}`;
    lines.push(`  ${label}  ${bar}  ${colorise(String(score).padStart(3))}  ${count}`);
  }
  return lines.join('\n');
}

function renderFinding(finding: Finding, c: Palette, width: number): string {
  const lines: string[] = [];
  const tag = severityTag(finding.severity, c);
  const blocker = finding.blocker === true ? ` ${c.bold(c.red('BLOCKER'))}` : '';
  lines.push(`  ${tag}${blocker} ${c.bold(finding.title)}`);

  for (const ev of finding.evidence.slice(0, 3)) {
    lines.push(`      ${c.cyan(`${ev.file}:${ev.line}:${ev.column}`)}`);
    if (ev.snippet.length > 0) {
      lines.push(`      ${c.dim('│')} ${c.dim(clip(ev.snippet, width - 10))}`);
    }
  }
  if (finding.evidence.length > 3) {
    lines.push(`      ${c.dim(`… ${finding.evidence.length - 3} more location(s)`)}`);
  }

  lines.push(`      ${wrap(finding.explanation, width - 6, '      ', c.reset)}`);
  lines.push(
    `      ${c.green('Fix:')} ${wrap(finding.remediation, width - 11, '           ', c.reset)}`,
  );
  lines.push(
    `      ${c.dim(`${finding.ruleId} · confidence ${finding.confidence} · ai-shipcheck explain ${finding.ruleId}`)}`,
  );
  lines.push('');
  return lines.join('\n');
}

function coverageNotes(result: ScanResult, c: Palette): string[] {
  const unassessed = result.checks.filter((check) => check.status === 'unassessed');
  if (unassessed.length === 0) return [];
  const lines = [c.bold(`  Not assessed (${unassessed.length})`), ''];
  for (const check of unassessed.slice(0, 5)) {
    lines.push(`  ${c.dim('·')} ${c.dim(check.ruleId)} ${c.dim('—')} ${c.dim(check.reason ?? '')}`);
  }
  if (unassessed.length > 5) lines.push(c.dim(`  · … and ${unassessed.length - 5} more`));
  return lines;
}

function verdictBlock(result: ScanResult, c: Palette, width: number): string {
  const lines: string[] = [];
  lines.push(c.bold('  Verdict'));
  lines.push('');
  for (const reason of result.verdictReasons) {
    lines.push(`  ${c.dim('·')} ${wrap(reason, width - 6, '    ', c.reset)}`);
  }
  return lines.join('\n');
}

function severityTag(severity: Severity, c: Palette): string {
  switch (severity) {
    case 'critical':
      return c.bold(c.red('CRITICAL'));
    case 'high':
      return c.red('HIGH    ');
    case 'medium':
      return c.yellow('MEDIUM  ');
    case 'low':
      return c.blue('LOW     ');
    case 'info':
      return c.dim('INFO    ');
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Wrap prose to `width`, indenting continuation lines. */
export function wrap(
  text: string,
  width: number,
  indent: string,
  _style: (s: string) => string,
): string {
  if (width < 20) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join(`\n${indent}`);
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function terminalWidth(): number {
  const columns = process.stdout.columns;
  if (typeof columns === 'number' && columns >= 60) return Math.min(columns, 120);
  return 100;
}
