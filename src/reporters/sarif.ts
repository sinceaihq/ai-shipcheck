import { CATEGORY_LABELS, type Finding, type Severity } from '../types/core.js';
import { createDefaultRegistry } from '../rules/index.js';
import type { Reporter } from './types.js';

/**
 * SARIF 2.1.0 output for GitHub Code Scanning.
 *
 * Notable requirements this implementation satisfies:
 *
 * - `$schema` and `version` are both present and match the 2.1.0 schema.
 * - Every result carries a `ruleId` that appears in `tool.driver.rules`, plus a
 *   `ruleIndex` so consumers do not have to search.
 * - Locations use `uriBaseId: "%SRCROOT%"` with repository-relative POSIX URIs,
 *   which is what GitHub expects for a checkout-relative path.
 * - `partialFingerprints` keeps a finding identified across line movement, so
 *   Code Scanning does not report the same issue as new on every push.
 * - Text is emitted as plain strings; nothing user-controlled is interpolated
 *   into markdown, so a crafted filename cannot inject formatting.
 */
const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

type SarifLevel = 'error' | 'warning' | 'note' | 'none';

/**
 * Map Shipcheck severity onto the four SARIF levels.
 *
 * `critical` and `high` both become `error` because Code Scanning has no
 * separate critical level; the numeric `security-severity` property carries
 * the distinction and is what GitHub sorts and filters on.
 */
function sarifLevel(severity: Severity): SarifLevel {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'note';
    case 'info':
      return 'none';
  }
}

/** GitHub's security-severity scale, 0.0-10.0. */
function securitySeverity(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return '9.5';
    case 'high':
      return '7.5';
    case 'medium':
      return '5.0';
    case 'low':
      return '3.0';
    case 'info':
      return '0.0';
  }
}

export const sarifReporter: Reporter = (result) => {
  const registry = createDefaultRegistry();
  const usedRuleIds = [...new Set(result.findings.map((f) => f.ruleId))].sort();
  const ruleIndex = new Map(usedRuleIds.map((id, index) => [id, index]));

  const rules = usedRuleIds.map((id) => {
    const rule = registry.get(id);
    const meta = rule?.meta;
    const category = meta?.category ?? 'security';
    return {
      id,
      name: toPascalCase(id),
      shortDescription: { text: meta?.title ?? id },
      fullDescription: { text: meta?.description ?? '' },
      help: {
        text: `${meta?.description ?? ''}\n\nRemediation: ${meta?.remediation ?? ''}`.trim(),
        markdown:
          `${meta?.description ?? ''}\n\n**Remediation:** ${meta?.remediation ?? ''}`.trim(),
      },
      defaultConfiguration: { level: sarifLevel(meta?.severity ?? 'medium') },
      properties: {
        tags: ['ai-shipcheck', category, ...(meta?.tags ?? [])],
        category,
        'security-severity': securitySeverity(meta?.severity ?? 'medium'),
        precision: precisionOf(meta?.confidence ?? 'medium'),
      },
      ...(meta?.references !== undefined && meta.references.length > 0
        ? { helpUri: meta.references[0] }
        : {}),
    };
  });

  const results = result.findings.map((finding) => toSarifResult(finding, ruleIndex));

  const log = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'AI Shipcheck',
            fullName: 'AI Shipcheck production-readiness scanner',
            version: result.tool.version,
            semanticVersion: result.tool.version,
            informationUri: 'https://github.com/sinceaihq/ai-shipcheck',
            rules,
          },
        },
        automationDetails: {
          id: `ai-shipcheck/${result.schemaVersion}`,
          description: {
            text:
              `AI Shipcheck ${result.verdict} - score ${result.score}/100 across ` +
              `${result.coverage.checksRun} of ${result.coverage.checksTotal} checks ` +
              `and ${result.coverage.categoriesAssessed} of ${result.coverage.categoriesTotal} categories.` +
              (result.stats.truncated
                ? ' A resource limit stopped the scan before the whole project was read.'
                : ''),
          },
        },
        columnKind: 'unicodeCodePoints',
        results,
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: result.generatedAt,
            ...(result.stats.warnings.length > 0
              ? {
                  toolExecutionNotifications: result.stats.warnings.slice(0, 50).map((message) => ({
                    level: 'note' as const,
                    message: { text: message },
                  })),
                }
              : {}),
          },
        ],
      },
    ],
  };

  return `${JSON.stringify(log, null, 2)}\n`;
};

function toSarifResult(
  finding: Finding,
  ruleIndex: ReadonlyMap<string, number>,
): Record<string, unknown> {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: { uri: ev.file, uriBaseId: '%SRCROOT%' },
      region: {
        startLine: Math.max(1, ev.line),
        startColumn: Math.max(1, ev.column),
        ...(ev.endLine !== undefined ? { endLine: Math.max(ev.endLine, ev.line) } : {}),
        ...(ev.endColumn !== undefined ? { endColumn: Math.max(1, ev.endColumn) } : {}),
        snippet: { text: ev.snippet },
      },
    },
    ...(ev.note !== undefined ? { message: { text: ev.note } } : {}),
  }));

  const primary = finding.evidence[0];
  return {
    ruleId: finding.ruleId,
    ruleIndex: ruleIndex.get(finding.ruleId) ?? 0,
    level: sarifLevel(finding.severity),
    message: {
      text: `${finding.title}. ${finding.explanation} Remediation: ${finding.remediation}`,
    },
    locations: locations.length > 0 ? locations : undefined,
    partialFingerprints: {
      shipcheckRuleLocation: fingerprint(
        `${finding.ruleId}|${primary?.file ?? ''}|${primary?.snippet ?? ''}`,
      ),
    },
    properties: {
      category: finding.category,
      categoryLabel: CATEGORY_LABELS[finding.category],
      confidence: finding.confidence,
      shipcheckSeverity: finding.severity,
      blocker: finding.blocker === true,
    },
  };
}

function precisionOf(confidence: 'high' | 'medium' | 'low'): string {
  return confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low';
}

function toPascalCase(id: string): string {
  return id
    .split(/[/-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * A stable, content-derived fingerprint. FNV-1a is used because it is short,
 * dependency-free and only needs to be stable, not cryptographic.
 */
function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
