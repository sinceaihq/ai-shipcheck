import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/**
 * A template literal containing SQL keywords *and* an interpolation.
 * `sql\`...\`` and `prisma.$queryRaw\`...\`` are tagged templates: the driver
 * parameterises them, so they are excluded.
 */
const SQL_TEMPLATE = /`([^`]{0,600})`/g;

const SQL_STATEMENT =
  /\b(?:select\s+[\s\S]{0,80}?\bfrom\b|insert\s+into\b|update\s+[a-z_"][\w".]*\s+set\b|delete\s+from\b|drop\s+table\b|alter\s+table\b)/i;

/** Tag functions that safely parameterise their interpolations. */
/**
 * Tag functions that parameterise their interpolations.
 *
 * Matches member forms (`Prisma.sql`, `db.sql`, `this.sql`) and generic forms
 * (`sql<number>`) as well as the bare tag. Missing those was the largest
 * source of false positives on real ORM code, where every safe query is
 * written as a tagged template.
 */
const SAFE_TAGS =
  /(?:\$queryRaw|\$executeRaw|\bsql|\bSQL|\bpostgres|\bneon|\bsqlTag)(?:<[^<>]{0,80}>)?\s*$/;

const CONCAT_QUERY =
  /\b(?:query|execute|raw|run|all|get|prepare)\s*\(\s*['"][^'"\n]{0,200}(?:select|insert|update|delete)[^'"\n]{0,200}['"]\s*\+/gi;

export default defineRule({
  meta: {
    id: 'database/raw-sql-interpolation',
    category: 'database',
    title: 'SQL query built by string interpolation',
    severity: 'critical',
    confidence: 'medium',
    blocker: true,
    description:
      'A SQL statement is assembled by interpolating values into a string. If any interpolated value can be influenced by a request, the caller controls the query - they can read other tables, drop data, or return every row regardless of the intended filter.',
    remediation:
      'Use parameter placeholders and pass values separately: prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}` (a tagged template, which parameterises), db.query("SELECT * FROM users WHERE id = $1", [id]), or the query builder your ORM provides. Never build the WHERE clause with template interpolation.',
    references: [
      'https://owasp.org/Top10/A03_2021-Injection/',
      'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
    ],
    tags: ['sql-injection', 'owasp-a03'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    // Interpolated SQL is a blocker where a request can reach it. In library
    // or tooling code the same construct is usually a query builder assembling
    // its own identifiers - a different risk, and not grounds for forcing a
    // NOT READY verdict on someone else's project.
    const inRequestPath =
      file.role === 'next-app-route' ||
      file.role === 'next-pages-api' ||
      file.role === 'server-actions' ||
      file.role === 'server-module';
    let reported = 0;

    for (const match of file.matches(SQL_TEMPLATE)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      // `file.matches` scans the masked view, so a template body is blanked -
      // read the real text back out of the source.
      const body = file.content.slice(match.index + 1, match.index + match.text.length - 1);
      if (!body.includes('${')) continue;
      if (!SQL_STATEMENT.test(body)) continue;

      const before = file.content.slice(Math.max(0, match.index - 40), match.index);
      if (SAFE_TAGS.test(before.trimEnd())) continue;

      reported++;
      ctx.report({
        severity: inRequestPath ? 'critical' : 'high',
        confidence: inRequestPath ? 'medium' : 'low',
        blocker: inRequestPath,
        explanation: inRequestPath
          ? `${file.path} builds a SQL statement with template interpolation rather than parameters, in code that serves requests. Whatever is substituted becomes part of the query text, so a value such as "1 OR 1=1" changes what the statement does.`
          : `${file.path} builds a SQL statement with template interpolation rather than parameters. If any interpolated value can be influenced by a request, it becomes part of the query text.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 160) })],
      });
    }

    for (const match of file.matches(CONCAT_QUERY)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: 'SQL query built by string concatenation',
        explanation: `${file.path} concatenates values into a SQL string before executing it. Use placeholders and a parameter array instead.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 160) })],
      });
    }
  },
});
