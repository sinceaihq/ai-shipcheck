import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const UNSAFE_RAW = /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/g;

export default defineRule({
  meta: {
    id: 'database/prisma-raw-unsafe',
    category: 'database',
    title: 'Prisma raw query executed without parameterisation',
    severity: 'high',
    confidence: 'high',
    requiresFrameworks: ['prisma'],
    description:
      'The Unsafe variants of Prisma raw query helpers take a plain string and send it to the database verbatim. They exist for the rare case where the statement structure itself is dynamic, and they carry no injection protection whatsoever.',
    remediation:
      'Use the tagged-template forms - prisma.$queryRaw`SELECT ... WHERE id = ${id}` - which parameterise every interpolation. If the table or column name genuinely must be dynamic, validate it against a fixed allowlist before building the string.',
    references: ['https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries'],
    tags: ['sql-injection', 'prisma', 'owasp-a03'],
  },

  checkFile(file, ctx) {
    if (file.role === 'test') return;
    let reported = 0;
    for (const match of file.matches(UNSAFE_RAW)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      const name = match.text.replace(/\s*\($/, '');
      ctx.report({
        title: `${name}() bypasses Prisma query parameterisation`,
        explanation: `${file.path} calls ${name}(), which sends its string argument to the database without parameterising it. Any interpolated value becomes part of the SQL.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});
