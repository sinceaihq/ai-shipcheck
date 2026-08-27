/**
 * The built-in rule catalogue.
 *
 * Every production rule is imported here exactly once. `defineRule` validates
 * each rule's metadata at import time and `RuleRegistry` rejects duplicate
 * ids, so a malformed or colliding rule fails immediately rather than
 * producing a subtly wrong report.
 *
 * To add a rule, create the file under the matching category directory, import
 * it below, and add its fixtures - see docs/adding-a-rule.md.
 */
import type { Rule } from '../types/rule.js';
import { RuleRegistry } from '../core/registry.js';

import securityCommittedEnvFile from './security/committed-env-file.js';
import securityDangerousHtml from './security/dangerous-html.js';
import securityDisabledTlsVerification from './security/disabled-tls-verification.js';
import securityEvalUsage from './security/eval-usage.js';
import securityExposedDebugRoute from './security/exposed-debug-route.js';
import securityHardcodedSecret from './security/hardcoded-secret.js';
import securityInsecureRandomness from './security/insecure-randomness.js';
import securityOpenRedirect from './security/open-redirect.js';
import securityPermissiveCors from './security/permissive-cors.js';
import securityPublicEnvSecret from './security/public-env-secret.js';
import securitySensitiveDataLogging from './security/sensitive-data-logging.js';
import securityUnsafeShellExec from './security/unsafe-shell-exec.js';
import securityUnsafeUrlConstruction from './security/unsafe-url-construction.js';
import securityWeakCrypto from './security/weak-crypto.js';
import authClientSideOnlyAuthorization from './auth/client-side-only-authorization.js';
import authJwtVerificationBypass from './auth/jwt-verification-bypass.js';
import authMissingAuthMiddleware from './auth/missing-auth-middleware.js';
import authServerActionMissingAuth from './auth/server-action-missing-auth.js';
import authSupabaseServiceRoleExposure from './auth/supabase-service-role-exposure.js';
import authUnprotectedRouteHandler from './auth/unprotected-route-handler.js';
import authUnscopedRecordAccess from './auth/unscoped-record-access.js';
import authUnverifiedWebhook from './auth/unverified-webhook.js';
import databaseDestructiveMigration from './database/destructive-migration.js';
import databaseHardcodedConnectionString from './database/hardcoded-connection-string.js';
import databasePermissiveRlsPolicy from './database/permissive-rls-policy.js';
import databasePrismaRawUnsafe from './database/prisma-raw-unsafe.js';
import databaseRawSqlInterpolation from './database/raw-sql-interpolation.js';
import databaseSupabaseMissingRls from './database/supabase-missing-rls.js';
import databaseUnboundedMutation from './database/unbounded-mutation.js';
import reliabilityDebugModeInProduction from './reliability/debug-mode-in-production.js';
import reliabilityHardcodedEnvironmentUrl from './reliability/hardcoded-environment-url.js';
import reliabilityMissingFetchTimeout from './reliability/missing-fetch-timeout.js';
import reliabilityMissingHealthEndpoint from './reliability/missing-health-endpoint.js';
import reliabilityProcessExitInRequestPath from './reliability/process-exit-in-request-path.js';
import reliabilityRetryWithoutBackoff from './reliability/retry-without-backoff.js';
import reliabilitySwallowedError from './reliability/swallowed-error.js';
import reliabilityUnhandledPromise from './reliability/unhandled-promise.js';
import testingCiMissingChecks from './testing/ci-missing-checks.js';
import testingFocusedOrSkippedTest from './testing/focused-or-skipped-test.js';
import testingNoTestInfrastructure from './testing/no-test-infrastructure.js';
import testingUntestedServerCode from './testing/untested-server-code.js';
import observabilityConsoleOnlyLogging from './observability/console-only-logging.js';
import observabilityMissingErrorBoundary from './observability/missing-error-boundary.js';
import observabilityNoErrorMonitoring from './observability/no-error-monitoring.js';
import observabilitySilentCatchInHandler from './observability/silent-catch-in-handler.js';
import performanceHeavyClientImport from './performance/heavy-client-import.js';
import performanceNPlusOneQuery from './performance/n-plus-one-query.js';
import performanceNextUnoptimizedImage from './performance/next-unoptimized-image.js';
import performanceSyncIoInRequestPath from './performance/sync-io-in-request-path.js';
import performanceUnboundedQuery from './performance/unbounded-query.js';
import accessibilityFormControlMissingLabel from './accessibility/form-control-missing-label.js';
import accessibilityImgMissingAlt from './accessibility/img-missing-alt.js';
import accessibilityInaccessibleInteractiveElement from './accessibility/inaccessible-interactive-element.js';
import accessibilityInvalidAnchor from './accessibility/invalid-anchor.js';
import accessibilityMissingHtmlLang from './accessibility/missing-html-lang.js';
import accessibilityNonInteractiveClickHandler from './accessibility/non-interactive-click-handler.js';
import accessibilityPositiveTabindex from './accessibility/positive-tabindex.js';
import aiCostAiKeyExposedToClient from './ai-cost/ai-key-exposed-to-client.js';
import aiCostLlmRouteWithoutRateLimit from './ai-cost/llm-route-without-rate-limit.js';
import aiCostMissingLlmTimeout from './ai-cost/missing-llm-timeout.js';
import aiCostMissingTokenLimit from './ai-cost/missing-token-limit.js';
import aiCostUntrustedPromptToTools from './ai-cost/untrusted-prompt-to-tools.js';
import aiCostUserControlledModel from './ai-cost/user-controlled-model.js';

/** All built-in rules, in category order. */
export const BUILTIN_RULES: readonly Rule[] = [
  securityCommittedEnvFile,
  securityDangerousHtml,
  securityDisabledTlsVerification,
  securityEvalUsage,
  securityExposedDebugRoute,
  securityHardcodedSecret,
  securityInsecureRandomness,
  securityOpenRedirect,
  securityPermissiveCors,
  securityPublicEnvSecret,
  securitySensitiveDataLogging,
  securityUnsafeShellExec,
  securityUnsafeUrlConstruction,
  securityWeakCrypto,
  authClientSideOnlyAuthorization,
  authJwtVerificationBypass,
  authMissingAuthMiddleware,
  authServerActionMissingAuth,
  authSupabaseServiceRoleExposure,
  authUnprotectedRouteHandler,
  authUnscopedRecordAccess,
  authUnverifiedWebhook,
  databaseDestructiveMigration,
  databaseHardcodedConnectionString,
  databasePermissiveRlsPolicy,
  databasePrismaRawUnsafe,
  databaseRawSqlInterpolation,
  databaseSupabaseMissingRls,
  databaseUnboundedMutation,
  reliabilityDebugModeInProduction,
  reliabilityHardcodedEnvironmentUrl,
  reliabilityMissingFetchTimeout,
  reliabilityMissingHealthEndpoint,
  reliabilityProcessExitInRequestPath,
  reliabilityRetryWithoutBackoff,
  reliabilitySwallowedError,
  reliabilityUnhandledPromise,
  testingCiMissingChecks,
  testingFocusedOrSkippedTest,
  testingNoTestInfrastructure,
  testingUntestedServerCode,
  observabilityConsoleOnlyLogging,
  observabilityMissingErrorBoundary,
  observabilityNoErrorMonitoring,
  observabilitySilentCatchInHandler,
  performanceHeavyClientImport,
  performanceNPlusOneQuery,
  performanceNextUnoptimizedImage,
  performanceSyncIoInRequestPath,
  performanceUnboundedQuery,
  accessibilityFormControlMissingLabel,
  accessibilityImgMissingAlt,
  accessibilityInaccessibleInteractiveElement,
  accessibilityInvalidAnchor,
  accessibilityMissingHtmlLang,
  accessibilityNonInteractiveClickHandler,
  accessibilityPositiveTabindex,
  aiCostAiKeyExposedToClient,
  aiCostLlmRouteWithoutRateLimit,
  aiCostMissingLlmTimeout,
  aiCostMissingTokenLimit,
  aiCostUntrustedPromptToTools,
  aiCostUserControlledModel,
];

/** Build a registry containing every built-in rule. */
export function createDefaultRegistry(): RuleRegistry {
  return RuleRegistry.from(BUILTIN_RULES);
}
