import {
  CATEGORIES,
  CATEGORY_LABELS,
  SEVERITIES,
  type Category,
  type CategoryScore,
  type CheckResult,
  type Finding,
  type ScoreContribution,
  type Severity,
  type Verdict,
} from '../types/core.js';
import {
  CATEGORY_WEIGHTS,
  CONFIDENCE_MULTIPLIERS,
  NOT_READY_SCORE_THRESHOLD,
  READY_SCORE_THRESHOLD,
  REPEAT_CAP_MULTIPLIER,
  REPEAT_FACTOR,
  SEVERITY_WEIGHTS,
} from './weights.js';

export interface ScoreInput {
  readonly findings: readonly Finding[];
  readonly checks: readonly CheckResult[];
}

export interface ScoreOutput {
  readonly score: number;
  readonly verdict: Verdict;
  readonly verdictReasons: readonly string[];
  readonly categories: readonly CategoryScore[];
}

function emptyCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

/**
 * Compute the penalty a single rule contributes to its category.
 *
 * The first finding costs the full severity weight; each additional finding
 * from the same rule costs {@link REPEAT_FACTOR} of it; the rule's total is
 * capped at {@link REPEAT_CAP_MULTIPLIER} times the base weight. The whole
 * amount is then scaled by the confidence multiplier.
 *
 * @param severity - Effective severity of the rule's findings.
 * @param confidence - Confidence shared by the rule's findings.
 * @param count - Number of findings the rule produced.
 */
export function rulePenalty(
  severity: Severity,
  confidence: keyof typeof CONFIDENCE_MULTIPLIERS,
  count: number,
): number {
  if (count <= 0) return 0;
  const base = SEVERITY_WEIGHTS[severity];
  if (base === 0) return 0;
  const raw = base * (1 + REPEAT_FACTOR * (count - 1));
  const capped = Math.min(raw, base * REPEAT_CAP_MULTIPLIER);
  return capped * CONFIDENCE_MULTIPLIERS[confidence];
}

/**
 * Score a scan.
 *
 * The model is intentionally simple enough to explain in a paragraph:
 *
 * 1. Every category starts at 100.
 * 2. Each rule that fired deducts points based on severity, confidence and how
 *    many times it fired (with diminishing returns).
 * 3. Categories with nothing assessable are marked `unassessed` and excluded
 *    from the overall score rather than being awarded a free 100.
 * 4. The overall score is the weighted mean of the assessed categories.
 * 5. A blocker finding forces `NOT READY` no matter what the number says.
 */
export function computeScore(input: ScoreInput): ScoreOutput {
  const byCategory = new Map<Category, Finding[]>();
  for (const category of CATEGORIES) byCategory.set(category, []);
  for (const finding of input.findings) {
    byCategory.get(finding.category)?.push(finding);
  }

  const categories: CategoryScore[] = [];

  for (const category of CATEGORIES) {
    const findings = byCategory.get(category) ?? [];
    const checks = input.checks.filter((c) => c.category === category);

    const counts = emptyCounts();
    for (const f of findings) counts[f.severity]++;

    // Group by rule id *and* severity/confidence so config overrides that
    // change a rule's severity are reflected correctly.
    const groups = new Map<
      string,
      { severity: Severity; confidence: Finding['confidence']; count: number }
    >();
    for (const f of findings) {
      const key = `${f.ruleId}|${f.severity}|${f.confidence}`;
      const existing = groups.get(key);
      if (existing === undefined) {
        groups.set(key, { severity: f.severity, confidence: f.confidence, count: 1 });
      } else {
        existing.count++;
      }
    }

    const contributions: ScoreContribution[] = [];
    let penalty = 0;
    for (const [key, group] of groups) {
      const p = rulePenalty(group.severity, group.confidence, group.count);
      penalty += p;
      contributions.push({
        ruleId: key.slice(0, key.indexOf('|')),
        severity: group.severity,
        confidence: group.confidence,
        count: group.count,
        penalty: round1(p),
      });
    }
    contributions.sort((a, b) => b.penalty - a.penalty || a.ruleId.localeCompare(b.ruleId));

    const ran = checks.filter((c) => c.status === 'pass' || c.status === 'fail');
    const applicable = checks.filter(
      (c) => c.status !== 'not-applicable' && c.status !== 'disabled',
    );

    let status: CategoryScore['status'];
    if (checks.length === 0 || applicable.length === 0) status = 'not-applicable';
    else if (ran.length === 0) status = 'unassessed';
    else status = 'assessed';

    categories.push({
      category,
      score: status === 'assessed' ? clamp(Math.round(100 - penalty)) : null,
      penalty: round1(penalty),
      status,
      findingCount: findings.length,
      counts,
      contributions,
    });
  }

  const assessed = categories.filter((c) => c.status === 'assessed' && c.score !== null);
  let score: number;
  if (assessed.length === 0) {
    // Nothing could be assessed. Reporting 100 would be a lie; report 0 with
    // an `unassessed` verdict reason instead.
    score = 0;
  } else {
    let weighted = 0;
    let totalWeight = 0;
    for (const c of assessed) {
      const w = CATEGORY_WEIGHTS[c.category];
      weighted += (c.score ?? 0) * w;
      totalWeight += w;
    }
    score = Math.round(weighted / totalWeight);
  }

  const { verdict, reasons } = decideVerdict({
    score,
    findings: input.findings,
    assessedCount: assessed.length,
    categories,
  });

  return { score, verdict, verdictReasons: reasons, categories };
}

interface VerdictInput {
  readonly score: number;
  readonly findings: readonly Finding[];
  readonly assessedCount: number;
  readonly categories: readonly CategoryScore[];
}

/**
 * Decide the verdict and produce the sentences that justify it.
 *
 * Blockers are absolute: a single blocking finding forces `NOT READY` even at
 * a score of 99. This is the guarantee that stops a good-looking number from
 * hiding something that must not ship.
 */
export function decideVerdict(input: VerdictInput): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = [];

  if (input.assessedCount === 0) {
    return {
      verdict: 'NEEDS ATTENTION',
      reasons: [
        'No production-readiness checks could be assessed for this project, so no score was produced.',
      ],
    };
  }

  const blockers = input.findings.filter((f) => f.blocker === true);
  const criticals = input.findings.filter((f) => f.severity === 'critical');
  const highs = input.findings.filter((f) => f.severity === 'high');

  let verdict: Verdict;

  if (blockers.length > 0) {
    verdict = 'NOT READY';
    const ruleIds = [...new Set(blockers.map((b) => b.ruleId))];
    reasons.push(
      `${blockers.length} blocking ${plural(blockers.length, 'issue')} must be fixed before deploying (${ruleIds.slice(0, 3).join(', ')}${ruleIds.length > 3 ? `, +${ruleIds.length - 3} more` : ''}). A blocker forces NOT READY regardless of score.`,
    );
  } else if (input.score < NOT_READY_SCORE_THRESHOLD) {
    verdict = 'NOT READY';
    reasons.push(
      `Overall score ${input.score} is below the ${NOT_READY_SCORE_THRESHOLD}-point NOT READY threshold.`,
    );
  } else if (criticals.length > 0) {
    verdict = 'NOT READY';
    reasons.push(
      `${criticals.length} critical ${plural(criticals.length, 'finding')} ${criticals.length === 1 ? 'was' : 'were'} reported.`,
    );
  } else if (input.score < READY_SCORE_THRESHOLD || highs.length > 0) {
    verdict = 'NEEDS ATTENTION';
    if (highs.length > 0) {
      reasons.push(
        `${highs.length} high-severity ${plural(highs.length, 'finding')} should be resolved before shipping.`,
      );
    }
    if (input.score < READY_SCORE_THRESHOLD) {
      reasons.push(
        `Overall score ${input.score} is below the ${READY_SCORE_THRESHOLD}-point READY threshold.`,
      );
    }
  } else {
    verdict = 'READY';
    reasons.push(
      `Overall score ${input.score} with no critical or high-severity findings across ${input.assessedCount} assessed ${plural(input.assessedCount, 'category', 'categories')}.`,
    );
  }

  const weakest = [...input.categories]
    .filter((c) => c.status === 'assessed' && c.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
  if (weakest !== undefined && (weakest.score ?? 100) < 100 && verdict !== 'READY') {
    reasons.push(
      `Weakest category: ${CATEGORY_LABELS[weakest.category]} at ${weakest.score}/100 (${weakest.findingCount} ${plural(weakest.findingCount, 'finding')}).`,
    );
  }

  const unassessed = input.categories.filter((c) => c.status === 'unassessed');
  if (unassessed.length > 0) {
    reasons.push(
      `${unassessed.length} ${plural(unassessed.length, 'category', 'categories')} could not be assessed and ${unassessed.length === 1 ? 'was' : 'were'} excluded from the score: ${unassessed.map((c) => CATEGORY_LABELS[c.category]).join(', ')}.`,
    );
  }

  return { verdict, reasons };
}

/** Count findings by severity across a result set. */
export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts = emptyCounts();
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Total findings at or above a severity threshold. */
export function countAtLeast(findings: readonly Finding[], threshold: Severity): number {
  const limit = SEVERITIES.indexOf(threshold);
  return findings.filter((f) => SEVERITIES.indexOf(f.severity) <= limit).length;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}
