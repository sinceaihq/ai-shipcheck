import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** `.then(...)` chains with no `.catch` or `.finally` following them. */
const THEN_CHAIN = /\.\s*then\s*\(/g;

export default defineRule({
  meta: {
    id: 'reliability/unhandled-promise',
    category: 'reliability',
    title: 'Promise chain with no rejection handler',
    severity: 'medium',
    confidence: 'low',
    description:
      'A .then() chain has no .catch(). An unhandled rejection terminates the Node process by default since Node 15, so a single transient failure in a background task can take the whole server down - and the stack trace points at the promise, not at what called it.',
    remediation:
      'Attach a .catch() that logs and recovers, or await the promise inside a try/catch. For fire-and-forget work, make the "ignore failures" decision explicit with .catch(err => logger.warn(...)) rather than leaving it implicit.',
    references: ['https://nodejs.org/api/cli.html#--unhandled-rejectionsmode'],
    tags: ['error-handling', 'resilience'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(THEN_CHAIN)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const statement = statementAround(file.code, match.index);
      if (statement === null) continue;
      if (/\.\s*catch\s*\(|\.\s*finally\s*\(/.test(statement)) continue;
      // A chain whose result is awaited, returned or assigned is handled by
      // whoever consumes it. Only a bare expression statement is genuinely
      // fire-and-forget.
      if (/\bawait\b|\breturn\b|\byield\b/.test(statement)) continue;
      if (/(?:^|[\s(,[])(?:const|let|var)\s|=[^=>]/.test(statement)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} starts a .then() chain that is neither awaited nor given a .catch(). A rejection here becomes an unhandled rejection and, by default, crashes the process.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});

/**
 * The full statement containing `offset`.
 *
 * Walking back to the previous `;` is not enough on its own: a promise chain
 * is routinely written across an object literal or an argument list, and a
 * naive scan stops at the first `{` or `}` it meets - losing the `const x =`
 * or `await` that shows the result is in fact handled. Depth tracking is what
 * makes the boundary correct.
 */
function statementAround(code: string, offset: number): string | null {
  let start = offset;
  let depth = 0;
  while (start > 0) {
    const ch = code[start - 1];
    if (ch === ')' || ch === '}' || ch === ']') depth++;
    else if (ch === '(' || ch === '{' || ch === '[') {
      if (depth === 0) break;
      depth--;
    } else if ((ch === ';' || ch === '\n') && depth === 0) {
      // A newline only ends the statement when the line before it is complete.
      if (ch === ';') break;
      const before = code.slice(Math.max(0, start - 200), start - 1).trimEnd();
      if (/[;{}]$/.test(before) || before.length === 0) break;
    }
    start--;
    if (offset - start > 4000) break;
  }

  let end = offset;
  depth = 0;
  while (end < code.length && end < offset + 4000) {
    const ch = code[end];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ';' && depth <= 0) break;
    end++;
  }
  return code.slice(start, Math.min(end + 1, code.length));
}
