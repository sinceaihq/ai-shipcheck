import { defineRule } from '../../core/define-rule.js';
import { isDeployableApp, isNonProductionFile } from '../helpers.js';
import type { ProjectIndex } from '../../core/project-index.js';
import type { SourceFile } from '../../analysis/source-file.js';

const LOGGER_DEPENDENCIES = [
  'pino',
  'winston',
  'bunyan',
  'roarr',
  'signale',
  'consola',
  'loglevel',
  'tslog',
  'log4js',
  '@logtail/node',
  'pino-http',
  'morgan',
  '@sentry/node',
  'dd-trace',
];

const CONSOLE_CALL = /\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(/g;

export default defineRule({
  meta: {
    id: 'observability/console-only-logging',
    category: 'observability',
    title: 'Server logging goes only through console',
    severity: 'medium',
    confidence: 'medium',
    description:
      'Server code logs exclusively with console. Unstructured text lines cannot be filtered by request id, severity or user, they carry no timestamps beyond what the platform adds, and they cannot be sampled or redacted. When something breaks at 3am, the difference between structured and unstructured logs is the difference between a query and a grep.',
    remediation:
      'Add a structured logger (pino is fast and has no runtime dependencies) and log JSON objects with a consistent shape: level, message, request id, user id. Configure a redaction list so credentials never reach the log stream.',
    references: ['https://12factor.net/logs'],
    tags: ['logging', 'monitoring'],
  },

  appliesTo(index) {
    if (!isDeployableApp(index)) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason:
          'This project does not look like a deployed application, so production log structure does not apply.',
      };
    }
    if (productionServerFiles(index).length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No server-side application modules were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    if (ctx.index.hasDependency(...LOGGER_DEPENDENCIES)) return;
    if (ctx.index.hasDependencyMatching('@opentelemetry/')) return;

    const withConsole = productionServerFiles(ctx.index).filter((f) => f.has(CONSOLE_CALL));
    if (withConsole.length === 0) {
      ctx.markUnassessed(
        'No logging calls were found in server code, so logging style could not be assessed.',
      );
      return;
    }

    ctx.report({
      title: `${withConsole.length} server module${withConsole.length === 1 ? '' : 's'} log through console with no structured logger installed`,
      explanation: `Server code writes ${withConsole.length === 1 ? 'log output' : `log output across ${withConsole.length} modules`} using console, and package.json declares no logging library. Production logs will be unstructured text with no request correlation and no redaction.`,
      evidence: withConsole.slice(0, 5).map((f) => {
        const match = [...f.matches(CONSOLE_CALL)][0];
        return f.evidenceAt(match?.index ?? 0, { note: 'console logging in server code' });
      }),
    });
  },
});

/**
 * Server modules that are part of the deployed application: not migrations,
 * not schemas, and not the build scripts and tooling where writing to the
 * console is exactly right.
 */
function productionServerFiles(index: ProjectIndex): readonly SourceFile[] {
  return index.serverFiles.filter(
    (file) => file.role !== 'sql' && file.role !== 'prisma-schema' && !isNonProductionFile(file),
  );
}
