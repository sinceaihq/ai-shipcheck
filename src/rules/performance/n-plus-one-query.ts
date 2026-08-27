import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Loops whose body issues a query per iteration. */
const LOOP = /\bfor\s*(?:await\s*)?\(|\.\s*(?:map|forEach|flatMap)\s*\(\s*(?:async\s*)?\(?/g;

const QUERY_CALL =
  /\bawait\s+[\w$.]{0,60}\.\s*(?:findUnique|findFirst|findMany|find|findOne|select|query|get|fetch|aggregate|count)\s*\(/;

/** `Promise.all` around the loop makes the queries concurrent, not sequential. */
const CONCURRENT = /Promise\s*\.\s*(?:all|allSettled)\s*\(/;

export default defineRule({
  meta: {
    id: 'performance/n-plus-one-query',
    category: 'performance',
    title: 'Database query issued inside a loop',
    severity: 'medium',
    confidence: 'low',
    description:
      'A query runs once per iteration of a loop. With ten rows the page is fine; with a thousand it makes a thousand sequential round trips, and total latency becomes the row count multiplied by the network latency to the database. This is the most common reason a page that was fast in development is slow in production.',
    remediation:
      'Fetch the related rows in one query with an IN clause or a join - findMany({ where: { id: { in: ids } } }) - and match them up in memory. With an ORM, use its include/with syntax so the join happens in the database.',
    tags: ['queries', 'latency'],
  },

  appliesTo(index) {
    if (!index.hasFramework('prisma', 'drizzle', 'supabase', 'mongoose')) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No supported database client was detected in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    if (!file.isServer || file.role === 'test') return;
    let reported = 0;

    for (const match of file.matches(LOOP)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const open = file.code.indexOf('{', match.index);
      if (open === -1) continue;
      const close = file.matchBrace(open);
      if (close === -1) continue;
      const body = file.code.slice(open, close);
      if (body.length > 4000) continue;
      if (!QUERY_CALL.test(body)) continue;

      // `await Promise.all(items.map(async ...))` is concurrent by design.
      const before = file.code.slice(Math.max(0, match.index - 60), match.index);
      if (CONCURRENT.test(before)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} awaits a database query inside a loop. Each iteration is a separate sequential round trip, so response time grows linearly with the number of items.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 60) })],
      });
    }
  },
});
