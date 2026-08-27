import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Mutations whose scope is determined by a filter that may be absent. */
const PRISMA_MUTATION = /\.\s*(deleteMany|updateMany)\s*\(\s*(\)|\{)/g;
const SUPABASE_MUTATION = /\.\s*from\s*\(\s*['"][\w.]+['"]\s*\)\s*\.\s*(delete|update)\s*\(/g;
const MONGO_MUTATION = /\.\s*(deleteMany|updateMany|remove)\s*\(\s*\{\s*\}\s*\)/g;
const SQL_UNFILTERED = /\b(?:delete\s+from|update)\s+[a-z_"][\w".]*\s*(?:set\s+[^;]{0,200})?;/gi;

/** Filter constructs that bound a mutation. */
const FILTER = /\b(?:where|eq|neq|in|match|filter|gt|lt|gte|lte|is|like|ilike|contains|_id)\b/;

export default defineRule({
  meta: {
    id: 'database/unbounded-mutation',
    category: 'database',
    title: 'Destructive query with no filter',
    severity: 'critical',
    confidence: 'medium',
    description:
      'A delete or update is issued without a filter, so it applies to every row in the table. In Supabase this is a particularly common mistake because the query builder happily executes .from("table").delete() with no .eq() attached.',
    remediation:
      'Always attach a filter that scopes the mutation - .eq("id", id) or where: { id } at minimum, and ideally a caller-ownership predicate as well. If a full-table operation is genuinely intended, isolate it in a maintenance script rather than application code.',
    tags: ['data-loss'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    const report = (index: number, length: number, title: string, explanation: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({ title, explanation, evidence: [file.evidenceAt(index, { length })] });
    };

    for (const match of file.matches(PRISMA_MUTATION)) {
      const method = match.groups[0] ?? 'deleteMany';
      const region = file.content.slice(match.index, match.index + 200);
      const args = region.slice(region.indexOf('('));
      if (FILTER.test(args)) continue;
      report(
        match.index,
        match.text.length,
        `${method}() called with no where clause`,
        `${file.path} calls ${method}() without a where clause, which matches every row in the table.`,
      );
    }

    for (const match of file.matchesText(SUPABASE_MUTATION)) {
      const method = match.groups[0] ?? 'delete';
      // The filter is chained after the call, so look at the rest of the statement.
      const end = file.content.indexOf(';', match.index);
      const statement = file.content.slice(match.index, end === -1 ? match.index + 300 : end);
      if (FILTER.test(statement)) continue;
      report(
        match.index,
        match.text.length,
        `Supabase ${method}() has no filter chained to it`,
        `${file.path} builds a Supabase ${method}() with no .eq()/.match()/.filter() attached, so it applies to every row the caller policy permits.`,
      );
    }

    for (const match of file.matches(MONGO_MUTATION)) {
      report(
        match.index,
        match.text.length,
        `${match.groups[0] ?? 'deleteMany'}({}) matches every document`,
        `${file.path} passes an empty filter, which selects the entire collection.`,
      );
    }

    if (file.ext === '.sql') {
      for (const match of file.matchesText(SQL_UNFILTERED)) {
        if (/\bwhere\b/i.test(match.text)) continue;
        report(
          match.index,
          Math.min(match.text.length, 120),
          'SQL statement modifies every row',
          `${file.path} contains a ${match.text.trim().split(/\s+/)[0]?.toUpperCase() ?? 'DELETE'} statement with no WHERE clause.`,
        );
      }
    }
  },

  fileExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.sql'],
});
