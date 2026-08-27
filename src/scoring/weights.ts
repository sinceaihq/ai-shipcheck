import type { Category, Confidence, Severity } from '../types/core.js';

/**
 * All scoring constants live here, in one place, so the model can be reasoned
 * about and changed deliberately. `docs/SCORING.md` documents these values and
 * `tests/unit/scoring.test.ts` pins every one of them.
 */

/**
 * Points deducted from a category's 100-point budget for the *first* finding
 * of a given rule, before the confidence multiplier is applied.
 *
 * `info` is deliberately zero: informational findings are surfaced to the user
 * but must never move a score, otherwise every report drifts downward as the
 * rule set grows.
 */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
};

/**
 * Confidence scales the penalty; it never changes the reported severity.
 *
 * A heuristic finding is still shown as `high` severity because that is how
 * bad it would be if real — it simply costs fewer points, so a report full of
 * low-confidence guesses cannot tank an otherwise healthy project.
 */
export const CONFIDENCE_MULTIPLIERS: Readonly<Record<Confidence, number>> = {
  high: 1,
  medium: 0.7,
  low: 0.4,
};

/**
 * Repeat findings from the same rule have diminishing returns: the first costs
 * full price, each additional one costs a quarter, and the rule's total is
 * capped at three times its base weight.
 *
 * Without this, one systemic mistake repeated across forty files would zero a
 * category and drown out every other signal.
 */
export const REPEAT_FACTOR = 0.25;
export const REPEAT_CAP_MULTIPLIER = 3;

/**
 * Relative importance of each category in the overall score. Only categories
 * that were actually assessed contribute, and the divisor is the sum of the
 * assessed categories' weights — so a project with no database is not
 * penalised for having no database findings.
 */
export const CATEGORY_WEIGHTS: Readonly<Record<Category, number>> = {
  security: 1.6,
  auth: 1.4,
  database: 1.3,
  reliability: 1,
  'ai-cost': 0.9,
  testing: 0.9,
  observability: 0.8,
  performance: 0.7,
  accessibility: 0.7,
};

/** Score at or above which a project may be called `READY`. */
export const READY_SCORE_THRESHOLD = 85;
/** Score below which a project is always `NOT READY`. */
export const NOT_READY_SCORE_THRESHOLD = 60;

/** Severity ordering, worst first. Used for sorting and `--fail-on`. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Numeric rank where a lower number is worse. */
export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/** True when `severity` is at least as bad as `threshold`. */
export function meetsSeverity(severity: Severity, threshold: Severity): boolean {
  return severityRank(severity) <= severityRank(threshold);
}
