import { defineRule } from '../../core/define-rule.js';
import { isDeployableApp, projectEvidence } from '../helpers.js';

const MONITORING_DEPENDENCIES = [
  '@sentry/node',
  '@sentry/nextjs',
  '@sentry/react',
  '@sentry/browser',
  '@sentry/sveltekit',
  '@sentry/nuxt',
  'bugsnag',
  '@bugsnag/js',
  'rollbar',
  '@honeybadger-io/js',
  'dd-trace',
  '@datadog/browser-rum',
  'newrelic',
  '@opentelemetry/sdk-node',
  '@opentelemetry/api',
  'elastic-apm-node',
  '@highlight-run/node',
  '@axiomhq/js',
  'logtail',
  '@logtail/node',
  '@vercel/otel',
  'posthog-node',
  '@appsignal/nodejs',
];

export default defineRule({
  meta: {
    id: 'observability/no-error-monitoring',
    category: 'observability',
    title: 'No production error monitoring',
    severity: 'medium',
    confidence: 'high',
    description:
      'No error monitoring or tracing SDK is installed. Without one, a production exception exists only as a line in a log stream nobody is reading - you find out from a user, hours later, with no stack trace and no idea how many people it affected.',
    remediation:
      'Install an error monitoring SDK and initialise it in both the server and client entry points. Sentry has a first-party Next.js integration; @vercel/otel or the OpenTelemetry SDK work if you would rather not add a vendor. Configure release tracking so errors are attributed to a deploy.',
    references: ['https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/'],
    tags: ['monitoring', 'owasp-a09'],
  },

  appliesTo(index) {
    if (!isDeployableApp(index)) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason:
          'This project looks like a library, CLI or set of scripts rather than a deployed application.',
      };
    }
    if (index.packageJson === null) {
      return {
        applicable: false,
        status: 'unassessed',
        reason: 'No readable package.json, so installed monitoring SDKs could not be determined.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    if (ctx.index.hasDependency(...MONITORING_DEPENDENCIES)) return;
    if (ctx.index.hasDependencyMatching('@sentry/')) return;
    if (ctx.index.hasDependencyMatching('@opentelemetry/')) return;

    ctx.report({
      explanation:
        'No error monitoring, tracing or exception-reporting SDK is declared in package.json. Production exceptions will not be reported anywhere you can see them.',
      evidence: [
        projectEvidence(ctx.index, 'package.json', {
          anchor: /"dependencies"/,
          note: 'no error monitoring SDK among the declared dependencies',
        }),
      ],
    });
  },
});
