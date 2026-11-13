import { defineRule } from '../../core/define-rule.js';
import { maskValue } from '../../utils/mask.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** A database URL that carries an inline password. */
const CONNECTION_STRING =
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|clickhouse):\/\/([^:@\s/'"]{1,64}):([^@\s'"]{1,256})@([^\s/'"]{1,256})/g;

const LOCAL_HOST =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|db|postgres|mysql|redis|mongo)(?::\d+)?$/;

/**
 * An authority that describes the shape of a connection string instead of
 * naming a server: `HOST:PORT`, `host:port`, `hostname`. A port that is a word
 * cannot be dialled, so `mysql://USER:PASSWORD@HOST:PORT/DATABASE` is help
 * text - an error message, a form placeholder - and there is no credential in
 * it to leak. A port supplied by interpolation (`:${port}`) is not a word, and
 * a URL written that way still carries whatever password precedes it.
 */
const SYNTAX_TEMPLATE_HOST = /^(?:host(?:name)?(?::[A-Za-z_]+)?|[^:[\]]+:[A-Za-z_]+)$/i;

export default defineRule({
  meta: {
    id: 'database/hardcoded-connection-string',
    category: 'database',
    title: 'Database connection string with inline credentials',
    severity: 'critical',
    confidence: 'high',
    blocker: true,
    description:
      'A connection string containing a username and password is written into a tracked file. Database URLs are the highest-value credential in most applications - they usually grant full read and write access to production data with no second factor.',
    remediation:
      'Read the connection string from an environment variable, keep the real value in your hosting provider secret store, and rotate the exposed password. Local development defaults belong in .env.example with placeholder credentials.',
    tags: ['secrets', 'database'],
  },

  fileExtensions: [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.env',
    '.yml',
    '.yaml',
    '.json',
  ],

  checkFile(file, ctx) {
    if (isNonProductionFile(file) && file.role !== 'env') return;
    if (/\.env\.(?:example|sample|template)$/.test(file.path)) return;

    let reported = 0;
    for (const match of file.matchesText(CONNECTION_STRING)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const [scheme, user, password, host] = match.groups;
      if (password === undefined || host === undefined) continue;
      if (password.startsWith('${') || password.includes('$')) continue;
      if (SYNTAX_TEMPLATE_HOST.test(host)) continue;
      if (
        /^(?:password|postgres|root|example|changeme|secret|test|mysecretpassword)$/i.test(password)
      ) {
        // A well-known throwaway password paired with a local host is a
        // development default, not a leaked production credential.
        if (LOCAL_HOST.test(host)) continue;
      }

      reported++;
      const isLocal = LOCAL_HOST.test(host);
      ctx.report({
        title: `${scheme ?? 'Database'} connection string with inline password`,
        severity: isLocal ? 'medium' : 'critical',
        confidence: isLocal ? 'medium' : 'high',
        blocker: !isLocal,
        explanation: isLocal
          ? `${file.path} contains a ${scheme ?? 'database'} URL for a local host with an inline password (${maskValue(password)}). Local defaults are lower risk, but committing them trains everyone to keep credentials in code.`
          : `${file.path} contains a ${scheme ?? 'database'} URL pointing at ${host} with an inline password (${maskValue(password)}). This is a full-access production credential in version control.`,
        evidence: [
          file.evidenceAt(match.index, {
            note: `${scheme ?? 'db'}://${user ?? ''}:${maskValue(password)}@${host}`,
          }),
        ],
      });
    }
  },
});
