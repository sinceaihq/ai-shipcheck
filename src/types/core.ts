/**
 * Stable, versioned public data model for AI Shipcheck.
 *
 * Anything exported from this file is part of the public contract consumed by
 * the JSON reporter, the GitHub Action and downstream tooling. Changing the
 * shape of these types requires bumping {@link SCHEMA_VERSION} and adding a
 * CHANGELOG entry.
 */

/** Schema version of the machine-readable (`--format json`) output. */
export const SCHEMA_VERSION = '1.0' as const;

/** Production-readiness dimensions Shipcheck evaluates. */
export const CATEGORIES = [
  'security',
  'auth',
  'database',
  'reliability',
  'testing',
  'observability',
  'performance',
  'accessibility',
  'ai-cost',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Human-facing labels for each category. */
export const CATEGORY_LABELS: Record<Category, string> = {
  security: 'Security',
  auth: 'Authentication & Authorization',
  database: 'Database & Data Safety',
  reliability: 'Reliability',
  testing: 'Testing',
  observability: 'Observability',
  performance: 'Performance',
  accessibility: 'Accessibility',
  'ai-cost': 'AI Cost & Abuse Controls',
};

/**
 * How bad the issue is if it is real. Severity is deliberately independent of
 * {@link Confidence} — a `critical` finding we are only `low` confidence about
 * is still described as critical, it is just weighted down when scoring.
 */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * How sure the static analysis is that the finding is a true positive.
 *
 * - `high`   — the evidence is essentially conclusive from source alone.
 * - `medium` — strong signal, but a legitimate design could explain it.
 * - `low`    — heuristic; surfaced for review, weighted lightly when scoring.
 */
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Overall ship/no-ship judgement. */
export const VERDICTS = ['READY', 'NEEDS ATTENTION', 'NOT READY'] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * A concrete, citable location backing a finding.
 *
 * `line`/`column` are 1-based to match editors, `endLine`/`endColumn` are
 * inclusive of the highlighted range's last character position.
 */
export interface Evidence {
  /** Repository-relative POSIX path (always `/`-separated, even on Windows). */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
  /** 1-based end line, when the match spans lines. */
  readonly endLine?: number;
  /** 1-based end column (exclusive). */
  readonly endColumn?: number;
  /**
   * The matched source text, trimmed and truncated. Secret-like values are
   * masked before they ever reach this field.
   */
  readonly snippet: string;
  /** Optional note explaining what specifically in the snippet is the problem. */
  readonly note?: string;
}

/** A single actionable (or informational) result produced by a rule. */
export interface Finding {
  /** Stable rule identifier, e.g. `security/eval-usage`. */
  readonly ruleId: string;
  /** Category the rule contributes to. */
  readonly category: Category;
  /** Short, specific description of what was found. */
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  /** Why this matters in production, in plain language. */
  readonly explanation: string;
  /** What to do about it. Concrete, not "consider reviewing". */
  readonly remediation: string;
  /** Supporting locations. Rules should always supply at least one when possible. */
  readonly evidence: readonly Evidence[];
  /** Optional reference links (OWASP, framework docs, ...). */
  readonly references?: readonly string[];
  /**
   * Set when the finding is a *blocker*: it forces a `NOT READY` verdict
   * regardless of the numeric score.
   */
  readonly blocker?: boolean;
}

/** Why a check produced no findings — used to avoid manufacturing scores. */
export type CheckStatus =
  /** The rule ran and found nothing wrong. */
  | 'pass'
  /** The rule ran and produced findings. */
  | 'fail'
  /** The rule does not apply to this project (e.g. a Next.js rule on a CLI). */
  | 'not-applicable'
  /** The rule could not be evaluated (e.g. no files of the required type). */
  | 'unassessed'
  /** The rule was disabled by configuration. */
  | 'disabled';

/** Per-rule execution outcome, retained so reports can explain coverage. */
export interface CheckResult {
  readonly ruleId: string;
  readonly category: Category;
  readonly status: CheckStatus;
  /** Populated for `unassessed` / `not-applicable` so users know why. */
  readonly reason?: string;
  readonly findingCount: number;
}

/** Score for one production-readiness dimension. */
export interface CategoryScore {
  readonly category: Category;
  /** 0-100, or `null` when the category could not be assessed at all. */
  readonly score: number | null;
  /** Total penalty applied before clamping, for transparency. */
  readonly penalty: number;
  readonly status: 'assessed' | 'unassessed' | 'not-applicable';
  readonly findingCount: number;
  readonly counts: Readonly<Record<Severity, number>>;
  /** Human-readable list of the penalties that moved this score. */
  readonly contributions: readonly ScoreContribution[];
}

/** One line item in the score explanation. */
export interface ScoreContribution {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly count: number;
  /** Points deducted from the category's 100-point budget. */
  readonly penalty: number;
}

/** Detected characteristics of the scanned project. */
export interface ProjectProfile {
  /** Absolute, resolved path of the scan root. */
  readonly root: string;
  readonly name: string | null;
  /** Package manager inferred from lockfiles. */
  readonly packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  /** Frameworks/services detected with reasonable confidence. */
  readonly frameworks: readonly DetectedFramework[];
  readonly languages: readonly ('typescript' | 'javascript')[];
  /** True when the repo contains server-side code we can reason about. */
  readonly hasServerCode: boolean;
  readonly hasClientCode: boolean;
  readonly hasTests: boolean;
  readonly hasCi: boolean;
  readonly isMonorepo: boolean;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly scripts: Readonly<Record<string, string>>;
}

/** A framework/platform/service Shipcheck recognised. */
export interface DetectedFramework {
  readonly id: FrameworkId;
  readonly name: string;
  readonly version: string | null;
  readonly confidence: Confidence;
  /** What made us believe this, e.g. `dependency:next`, `file:next.config.js`. */
  readonly signals: readonly string[];
}

export const FRAMEWORK_IDS = [
  'next',
  'next-app-router',
  'next-pages-router',
  'react',
  'vite',
  'express',
  'fastify',
  'hono',
  'nestjs',
  'remix',
  'astro',
  'sveltekit',
  'nuxt',
  'supabase',
  'firebase',
  'prisma',
  'drizzle',
  'mongoose',
  'stripe',
  'openai',
  'anthropic',
  'vercel-ai-sdk',
  'langchain',
  'vitest',
  'jest',
  'playwright',
  'cypress',
  'tailwind',
  'trpc',
] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

/** Aggregate statistics about what was actually scanned. */
export interface ScanStats {
  readonly filesScanned: number;
  readonly filesSkipped: number;
  readonly bytesScanned: number;
  readonly durationMs: number;
  readonly rulesRun: number;
  readonly rulesSkipped: number;
  /** Non-fatal problems (unreadable file, malformed JSON, ...). */
  readonly warnings: readonly string[];
}

/** The complete, serialisable result of a scan. */
export interface ScanResult {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly tool: { readonly name: string; readonly version: string };
  /** ISO-8601 timestamp. */
  readonly generatedAt: string;
  readonly profile: ProjectProfile;
  readonly findings: readonly Finding[];
  readonly checks: readonly CheckResult[];
  readonly score: number;
  readonly verdict: Verdict;
  /** Sentence(s) explaining the verdict, including any forcing blockers. */
  readonly verdictReasons: readonly string[];
  readonly categories: readonly CategoryScore[];
  readonly stats: ScanStats;
}
