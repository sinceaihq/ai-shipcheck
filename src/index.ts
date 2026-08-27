/**
 * Public library surface.
 *
 * Everything exported here is covered by semantic versioning. The CLI is a
 * thin wrapper over exactly these functions.
 */
export * from './types/core.js';
export type { Rule, RuleMeta, RuleContext, RuleFinding, Applicability } from './types/rule.js';
export { runScan, resolveRules, compareFindings } from './core/engine.js';
export { buildIndex } from './core/build-index.js';
export { ProjectIndex } from './core/project-index.js';
export { RuleRegistry } from './core/registry.js';
export { defineRule } from './core/define-rule.js';
export { SourceFile } from './analysis/source-file.js';
export { lex } from './analysis/lexer.js';
export { BUILTIN_RULES, createDefaultRegistry } from './rules/index.js';
export {
  computeScore,
  decideVerdict,
  rulePenalty,
  countBySeverity,
  countAtLeast,
} from './scoring/score.js';
export * from './scoring/weights.js';
export { loadConfig, validateConfig, DEFAULT_CONFIG } from './config/index.js';
export type { ShipcheckConfig, RuleSetting } from './config/schema.js';
export { getReporter, FORMATS } from './reporters/index.js';
export type { Format, Reporter, ReporterOptions } from './reporters/types.js';
export { maskSecret, maskValue } from './utils/mask.js';
export { ShipcheckError, UsageError, ConfigError, TargetError } from './utils/errors.js';
export { VERSION } from './version.js';
