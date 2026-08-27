import { performance } from 'node:perf_hooks';
import {
  CATEGORIES,
  SCHEMA_VERSION,
  SEVERITIES,
  type AssessmentCoverage,
  type CheckResult,
  type Finding,
  type ScanResult,
} from '../types/core.js';
import type { Rule, RuleContext, RuleFinding } from '../types/rule.js';
import type { ShipcheckConfig } from '../config/schema.js';
import type { RuleRegistry } from './registry.js';
import type { ProjectIndex } from './project-index.js';
import { buildIndex } from './build-index.js';
import { computeScore } from '../scoring/score.js';
import { SOURCE_EXTENSIONS } from '../filesystem/limits.js';
import { describeError } from '../utils/errors.js';
import { VERSION } from '../version.js';

export interface RunScanOptions {
  readonly root: string;
  readonly config: ShipcheckConfig;
  readonly registry: RuleRegistry;
  /** Called after the index is built, before rules run. Used for progress UI. */
  readonly onProgress?: (event: ProgressEvent) => void;
}

export type ProgressEvent =
  | { readonly phase: 'indexing' }
  | { readonly phase: 'indexed'; readonly fileCount: number }
  | { readonly phase: 'rules'; readonly total: number }
  | { readonly phase: 'done' };

/** Effective, config-resolved settings for a single rule. */
interface ResolvedRule {
  readonly rule: Rule;
  readonly enabled: boolean;
  readonly severity: Finding['severity'];
}

/**
 * Resolve configuration overrides against the rule catalogue.
 *
 * Unknown rule ids in configuration are surfaced as warnings rather than
 * errors: a config written for a newer version of Shipcheck should still run.
 */
export function resolveRules(
  registry: RuleRegistry,
  config: ShipcheckConfig,
): { resolved: readonly ResolvedRule[]; warnings: readonly string[] } {
  const warnings: string[] = [];
  const disabledCategories = new Set(config.disabledCategories);

  for (const id of Object.keys(config.rules)) {
    if (registry.get(id) === undefined) {
      const suggestions = registry.suggest(id);
      warnings.push(
        `Configuration refers to unknown rule "${id}"${
          suggestions.length > 0
            ? `. Did you mean ${suggestions.map((s) => `"${s}"`).join(', ')}?`
            : '.'
        }`,
      );
    }
  }

  const resolved = registry.all().map((rule) => {
    const setting = config.rules[rule.meta.id];
    let enabled = !disabledCategories.has(rule.meta.category);
    let severity = rule.meta.severity;
    if (setting === 'off') enabled = false;
    else if (setting === 'on') enabled = true;
    else if (typeof setting === 'object' && setting !== null) {
      if (setting.enabled !== undefined) enabled = setting.enabled;
      if (setting.severity !== undefined) severity = setting.severity;
    }
    return { rule, enabled, severity };
  });

  return { resolved, warnings };
}

/**
 * Run a full scan: build the project index once, then execute every applicable
 * rule against it.
 *
 * A rule that throws is contained — it is recorded as `unassessed` with the
 * error message and the scan continues. A broken third-party rule must never
 * be able to fail someone's whole report.
 */
export async function runScan(options: RunScanOptions): Promise<ScanResult> {
  const started = performance.now();
  options.onProgress?.({ phase: 'indexing' });

  const built = await buildIndex({ root: options.root, config: options.config });
  const index = built.index;
  options.onProgress?.({ phase: 'indexed', fileCount: built.filesScanned });

  const { resolved, warnings: configWarnings } = resolveRules(options.registry, options.config);
  options.onProgress?.({ phase: 'rules', total: resolved.length });

  const findings: Finding[] = [];
  const checks: CheckResult[] = [];
  const warnings: string[] = [...built.warnings, ...configWarnings];
  let rulesRun = 0;
  let rulesSkipped = 0;

  for (const { rule, enabled, severity } of resolved) {
    if (!enabled) {
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'disabled',
        findingCount: 0,
      });
      rulesSkipped++;
      continue;
    }

    const frameworkGate = checkFrameworkGate(rule, index);
    if (frameworkGate !== null) {
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'not-applicable',
        reason: frameworkGate,
        findingCount: 0,
      });
      rulesSkipped++;
      continue;
    }

    if (rule.appliesTo !== undefined) {
      const applicability = rule.appliesTo(index);
      if (!applicability.applicable) {
        checks.push({
          ruleId: rule.meta.id,
          category: rule.meta.category,
          status: applicability.status,
          reason: applicability.reason,
          findingCount: 0,
        });
        rulesSkipped++;
        continue;
      }
    }

    const collected: Finding[] = [];
    let unassessedReason: string | null = null;

    const ctx: RuleContext = {
      index,
      severity,
      report(finding: RuleFinding): void {
        collected.push(materialise(rule, severity, finding));
      },
      markUnassessed(reason: string): void {
        unassessedReason ??= reason;
      },
    };

    let filesConsidered = 0;
    try {
      if (rule.checkFile !== undefined) {
        const extensions = rule.fileExtensions ?? SOURCE_EXTENSIONS;
        for (const file of index.files) {
          if (!extensions.includes(file.ext)) continue;
          filesConsidered++;
          rule.checkFile(file, ctx);
        }
        // A file-scoped rule that saw nothing has not passed - it has not run.
        // Recording that keeps an empty or unsupported directory from
        // collecting a perfect score it never earned.
        if (filesConsidered === 0 && rule.checkProject === undefined) {
          ctx.markUnassessed('No files of a type this rule inspects were found.');
        }
      }
      rule.checkProject?.(ctx);
    } catch (error) {
      warnings.push(`Rule "${rule.meta.id}" failed: ${describeError(error)}`);
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'unassessed',
        reason: `Rule threw an error: ${describeError(error)}`,
        findingCount: 0,
      });
      rulesSkipped++;
      continue;
    }

    rulesRun++;
    const deduped = dedupeFindings(collected);
    findings.push(...deduped);

    if (deduped.length > 0) {
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'fail',
        findingCount: deduped.length,
      });
    } else if (unassessedReason !== null) {
      rulesRun--;
      rulesSkipped++;
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'unassessed',
        reason: unassessedReason,
        findingCount: 0,
      });
    } else {
      checks.push({
        ruleId: rule.meta.id,
        category: rule.meta.category,
        status: 'pass',
        findingCount: 0,
      });
    }
  }

  findings.sort(compareFindings);
  checks.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  const { score, verdict, verdictReasons, categories } = computeScore({ findings, checks });
  options.onProgress?.({ phase: 'done' });

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'ai-shipcheck', version: VERSION },
    generatedAt: new Date().toISOString(),
    profile: index.profile,
    findings,
    checks,
    score,
    verdict,
    verdictReasons,
    categories,
    coverage: summariseCoverage(checks, categories),
    stats: {
      filesScanned: built.filesScanned,
      filesSkipped: built.filesSkipped,
      bytesScanned: built.bytesScanned,
      durationMs: Math.round(performance.now() - started),
      rulesRun,
      rulesSkipped,
      truncated: built.truncated,
      skippedByReason: countByReason(built.skipped),
      warnings,
    },
  };
}

/**
 * Summarise what the scan was able to assess.
 *
 * These are counts rather than a percentage on purpose. "38 of 63 checks ran"
 * is a verifiable statement; a coverage percentage would imply a measure of
 * completeness that static analysis of source code cannot support.
 */
function summariseCoverage(
  checks: readonly CheckResult[],
  categories: readonly ScanResult['categories'][number][],
): AssessmentCoverage {
  return {
    checksRun: checks.filter((c) => c.status === 'pass' || c.status === 'fail').length,
    checksTotal: checks.length,
    checksUnassessed: checks.filter((c) => c.status === 'unassessed').length,
    checksNotApplicable: checks.filter((c) => c.status === 'not-applicable').length,
    checksDisabled: checks.filter((c) => c.status === 'disabled').length,
    categoriesAssessed: categories.filter((c) => c.status === 'assessed').length,
    categoriesTotal: CATEGORIES.length,
  };
}

/** Tally skipped files by reason, omitting reasons that did not occur. */
function countByReason(skipped: readonly { reason: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of skipped) {
    counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function checkFrameworkGate(rule: Rule, index: ProjectIndex): string | null {
  const required = rule.meta.requiresFrameworks;
  if (required === undefined || required.length === 0) return null;
  if (index.hasFramework(...required)) return null;
  return `Requires ${required.join(' or ')}, which was not detected in this project.`;
}

function materialise(rule: Rule, severity: Finding['severity'], finding: RuleFinding): Finding {
  const result: {
    ruleId: string;
    category: Finding['category'];
    title: string;
    severity: Finding['severity'];
    confidence: Finding['confidence'];
    explanation: string;
    remediation: string;
    evidence: readonly Finding['evidence'][number][];
    references?: readonly string[];
    blocker?: boolean;
  } = {
    ruleId: rule.meta.id,
    category: rule.meta.category,
    title: finding.title ?? rule.meta.title,
    severity: finding.severity ?? severity,
    confidence: finding.confidence ?? rule.meta.confidence,
    explanation: finding.explanation ?? rule.meta.description,
    remediation: finding.remediation ?? rule.meta.remediation,
    evidence: finding.evidence,
  };
  if (rule.meta.references !== undefined) result.references = rule.meta.references;
  const blocker = finding.blocker ?? rule.meta.blocker;
  if (blocker === true) result.blocker = true;
  return result;
}

/**
 * Collapse findings a rule reported more than once at the same place.
 *
 * Several rules match through a list of alternative patterns, and a single
 * call site can satisfy two of them - `chat.completions.create` matches both
 * the chat-specific and the generic completions pattern. Deduplicating
 * centrally means no rule has to remember, and a duplicate can never
 * double-count against the score.
 */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const first = finding.evidence[0];
    const key =
      first === undefined
        ? `${finding.ruleId}|${finding.title}`
        : `${finding.ruleId}|${first.file}|${first.line}|${first.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

/** Deterministic ordering: worst first, then stable by rule and location. */
export function compareFindings(a: Finding, b: Finding): number {
  const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  if (bySeverity !== 0) return bySeverity;
  const byRule = a.ruleId.localeCompare(b.ruleId);
  if (byRule !== 0) return byRule;
  const af = a.evidence[0];
  const bf = b.evidence[0];
  if (af === undefined || bf === undefined) return 0;
  const byFile = af.file.localeCompare(bf.file);
  if (byFile !== 0) return byFile;
  return af.line - bf.line || af.column - bf.column;
}
