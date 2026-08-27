import { defineRule } from '../../core/define-rule.js';
import { stripSqlComments } from './sql.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/**
 * Statements that destroy data.
 *
 * Dropping a *constraint* or an *index* is deliberately absent: it changes
 * what the database enforces or how it searches, but no row is lost. Prisma
 * emits `ALTER TABLE ... DROP CONSTRAINT` in almost every migration that
 * touches a relation, and reporting those buried the statements that do
 * genuinely delete data.
 */
const DESTRUCTIVE =
  /\b(drop\s+table|drop\s+column|drop\s+schema|drop\s+database|truncate(?:\s+table)?|alter\s+table\s+[\w".]+\s+drop\s+column)\b/gi;

/** Guards that make a destructive statement safe to re-run and intentional. */
const GUARDED = /if\s+exists/i;

export default defineRule({
  meta: {
    id: 'database/destructive-migration',
    category: 'database',
    title: 'Migration destroys data without a guard',
    severity: 'high',
    confidence: 'medium',
    description:
      'A migration drops a table, column or schema, or truncates data. Migrations run automatically on deploy in most hosting setups, so a destructive statement that reaches production is irreversible without a restore - and the deploy that runs it is usually not the one being watched closely.',
    remediation:
      'Split destructive changes into their own migration, deploy it separately from application changes, and confirm a backup exists first. For column removal, use the expand/contract pattern: stop writing the column, deploy, then drop it in a later migration once nothing reads it.',
    tags: ['migrations', 'data-loss'],
  },

  fileExtensions: ['.sql'],

  appliesTo(index) {
    if (index.findFiles((f) => f.ext === '.sql').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No SQL migration files were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    if (file.ext !== '.sql') return;
    const sql = stripSqlComments(file.content);
    let reported = 0;

    const re = new RegExp(DESTRUCTIVE.source, DESTRUCTIVE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const statementEnd = sql.indexOf(';', m.index);
      const statement = sql.slice(m.index, statementEnd === -1 ? sql.length : statementEnd);
      const operation = (m[1] ?? m[0]).replace(/\s+/g, ' ').toUpperCase();

      reported++;
      ctx.report({
        title: `Migration performs ${operation}`,
        confidence: GUARDED.test(statement) ? 'low' : 'medium',
        explanation: `${file.path} contains a ${operation} statement. When this migration runs on deploy the affected data is gone, and there is no application-level rollback.`,
        evidence: [file.evidenceAt(m.index, { length: Math.min(statement.length, 120) })],
      });
    }
  },
});
