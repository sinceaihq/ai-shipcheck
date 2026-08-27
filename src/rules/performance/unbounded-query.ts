import { defineRule } from '../../core/define-rule.js';
import { callArgumentObject, isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';
import type { SourceFile } from '../../analysis/source-file.js';

const PRISMA_FIND_MANY = /\.\s*findMany\s*\(\s*(\)|\{)/g;
const SUPABASE_SELECT = /\.\s*from\s*\(\s*['"][\w.]+['"]\s*\)\s*\.\s*select\s*\(/g;
const MONGO_FIND = /\.\s*find\s*\(\s*(?:\{\s*\}\s*)?\)/g;
const SQL_SELECT_ALL = /\bselect\s+\*\s+from\s+[\w".]+\s*(?:;|$)/gi;

/** Constructs that bound the number of rows returned. */
/**
 * A `where` clause counts as a bound. `findMany({ where: { id: { in: ids } } })`
 * is a targeted lookup, not a table scan, and treating it as unbounded made
 * this rule fire on the most common query shape in every application.
 */
const BOUND =
  /\b(?:take|limit|first|top|range|maxResults|pageSize|cursor|skip|offset|paginate|count|where|filter)\b/;

export default defineRule({
  meta: {
    id: 'performance/unbounded-query',
    category: 'performance',
    title: 'Query returns every row with no limit',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A query fetches an entire table with no limit or pagination. It is fast with the fifty rows in development and it is an out-of-memory crash with the two million rows in production - and the failure arrives suddenly, on a table that had been fine for months.',
    remediation:
      'Add a limit to every list query and paginate the results - cursor pagination for infinite scroll, offset pagination for numbered pages. Select only the columns you render rather than the whole row.',
    tags: ['queries', 'scalability'],
  },

  fileExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.sql'],

  appliesTo(index) {
    if (
      !index.hasFramework('prisma', 'drizzle', 'supabase', 'mongoose') &&
      index.findFiles((f) => f.ext === '.sql').length === 0
    ) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No database client or SQL files were detected in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    const emit = (index: number, length: number, title: string, detail: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({ title, explanation: detail, evidence: [file.evidenceAt(index, { length })] });
    };

    for (const match of file.matches(PRISMA_FIND_MANY)) {
      const region = callArguments(file, match.index);
      if (region === null || BOUND.test(region)) continue;
      emit(
        match.index,
        match.text.length,
        'findMany() has no take or cursor',
        `${file.path} calls findMany() without take, skip or a cursor, so it loads the whole table into memory.`,
      );
    }

    for (const match of file.matchesText(SUPABASE_SELECT)) {
      const end = file.content.indexOf(';', match.index);
      const statement = file.content.slice(match.index, end === -1 ? match.index + 400 : end);
      if (BOUND.test(statement)) continue;
      if (/\.\s*single\s*\(|\.\s*maybeSingle\s*\(|\.\s*eq\s*\(/.test(statement)) continue;
      emit(
        match.index,
        match.text.length,
        'Supabase select() has no range or limit',
        `${file.path} selects from a table with no .limit() or .range() and no filter, which returns every row the policy allows.`,
      );
    }

    for (const match of file.matches(MONGO_FIND)) {
      const region = statementFrom(file, match.index);
      if (BOUND.test(region)) continue;
      emit(
        match.index,
        match.text.length,
        'Collection scanned with no limit',
        `${file.path} calls find() with an empty filter and no limit, returning the entire collection.`,
      );
    }

    if (file.ext === '.sql') {
      for (const match of file.matchesText(SQL_SELECT_ALL)) {
        emit(
          match.index,
          Math.min(match.text.length, 120),
          'SELECT * with no LIMIT',
          `${file.path} contains an unbounded SELECT *.`,
        );
      }
    }
  },
});

/** Arguments of the call whose `(` follows `offset`, or null. */
function callArguments(file: SourceFile, offset: number): string | null {
  return callArgumentObject(file, offset);
}

/** Text from `offset` to the end of the chained statement. */
function statementFrom(file: SourceFile, offset: number): string {
  const end = file.content.indexOf(';', offset);
  return file.content.slice(offset, end === -1 ? offset + 300 : end);
}
