import type { Category, Confidence, Evidence, Finding, FrameworkId, Severity } from './core.js';
import type { ProjectIndex } from '../core/project-index.js';
import type { SourceFile } from '../analysis/source-file.js';

/**
 * Static metadata describing a rule. Every production rule must supply the
 * full set — `npm run docs:check` fails the build if documentation drifts.
 */
export interface RuleMeta {
  /** Stable id, always `<category>/<kebab-name>`. */
  readonly id: string;
  readonly category: Category;
  /** One-line summary, used in `ai-shipcheck rules`. */
  readonly title: string;
  /** Default severity. May be overridden by user config. */
  readonly severity: Severity;
  /** Baseline confidence for findings this rule emits. */
  readonly confidence: Confidence;
  /** Longer prose explaining the risk. Rendered by `ai-shipcheck explain`. */
  readonly description: string;
  /** Default remediation guidance. Individual findings may refine it. */
  readonly remediation: string;
  readonly references?: readonly string[];
  /**
   * When true, any finding from this rule forces a `NOT READY` verdict.
   * Reserved for issues that are unambiguously unsafe to deploy.
   */
  readonly blocker?: boolean;
  /**
   * Restricts the rule to projects where at least one of these frameworks was
   * detected. Omit for framework-agnostic rules.
   */
  readonly requiresFrameworks?: readonly FrameworkId[];
  /** Tags used for filtering and documentation grouping. */
  readonly tags?: readonly string[];
}

/** Result of a rule's applicability probe. */
export type Applicability =
  | { readonly applicable: true }
  | {
      readonly applicable: false;
      readonly status: 'not-applicable' | 'unassessed';
      readonly reason: string;
    };

/** Shared, read-only context handed to every rule. */
export interface RuleContext {
  readonly index: ProjectIndex;
  /** Effective severity for this rule after config overrides. */
  readonly severity: Severity;
  /** Emit a finding. Severity/confidence default to the rule's metadata. */
  report(finding: RuleFinding): void;
  /**
   * Record that the rule could run but had nothing to look at, e.g. no route
   * handlers existed. Prevents an unassessable check from inflating the score.
   */
  markUnassessed(reason: string): void;
}

/** What a rule passes to {@link RuleContext.report}. */
export interface RuleFinding {
  readonly title?: string;
  readonly severity?: Severity;
  readonly confidence?: Confidence;
  readonly explanation?: string;
  readonly remediation?: string;
  readonly evidence: readonly Evidence[];
  readonly blocker?: boolean;
}

/**
 * The rule plugin contract.
 *
 * A rule is either *file-scoped* (`checkFile`, invoked once per candidate
 * source file) or *project-scoped* (`checkProject`, invoked once with the
 * whole index), or both. File-scoped rules are strongly preferred because the
 * engine can parallelise and cache around them.
 */
export interface Rule {
  readonly meta: RuleMeta;
  /**
   * Optional gate. Returning a non-applicable result records the reason in the
   * report instead of silently passing.
   */
  appliesTo?(index: ProjectIndex): Applicability;
  /** File extensions (with leading dot) this rule wants. Defaults to JS/TS. */
  readonly fileExtensions?: readonly string[];
  checkFile?(file: SourceFile, ctx: RuleContext): void;
  checkProject?(ctx: RuleContext): void;
}

/** Internal: a finding plus the rule that produced it. */
export type ResolvedFinding = Finding;
