import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const SYNC_FS =
  /\b(?:fs\s*\.\s*)?(readFileSync|writeFileSync|appendFileSync|readdirSync|statSync|existsSync|mkdirSync|unlinkSync|copyFileSync|rmSync)\s*\(/g;
const SYNC_CRYPTO = /\b(?:crypto\s*\.\s*)?(pbkdf2Sync|scryptSync|randomBytes\s*\(\s*\d{4,})\s*\(?/g;
const SYNC_HASH = /\bbcrypt\s*\.\s*(?:hashSync|compareSync)\s*\(/g;
const SYNC_EXEC = /\bexecSync\s*\(|\bspawnSync\s*\(/g;

export default defineRule({
  meta: {
    id: 'performance/sync-io-in-request-path',
    category: 'performance',
    title: 'Synchronous I/O in a request handler',
    severity: 'high',
    confidence: 'high',
    description:
      'Node runs JavaScript on a single thread. A synchronous filesystem read, a synchronous hash or a synchronous child process blocks that thread completely: every other request being served by the same instance waits, including health checks. Latency degrades for everyone, not just the caller who triggered it.',
    remediation:
      'Use the promise-based equivalents - fs/promises, crypto.scrypt with a callback, bcrypt.hash - so the event loop stays free. For values that never change, read them once at module load rather than per request.',
    references: ['https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop'],
    tags: ['event-loop', 'latency'],
  },

  appliesTo(index) {
    if (index.routeFiles.length === 0 && index.serverFiles.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No server-side request handlers were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (
      file.role !== 'next-app-route' &&
      file.role !== 'next-pages-api' &&
      file.role !== 'server-actions' &&
      file.role !== 'next-middleware' &&
      file.role !== 'server-module'
    ) {
      return;
    }

    let reported = 0;
    const emit = (index: number, length: number, what: string, why: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: `${what} blocks the event loop in a request handler`,
        explanation: `${file.path} calls ${what} while serving requests. ${why}`,
        evidence: [file.evidenceAt(index, { length })],
      });
    };

    for (const match of file.matches(SYNC_FS)) {
      const name = match.groups[0] ?? 'a synchronous fs call';
      emit(
        match.index,
        match.text.length,
        `${name}()`,
        'Every concurrent request on this instance stalls until the disk operation completes.',
      );
    }
    for (const match of file.matches(SYNC_CRYPTO)) {
      emit(
        match.index,
        match.text.length,
        `${match.groups[0] ?? 'a synchronous crypto call'}()`,
        'Key derivation is deliberately slow; running it synchronously freezes the process for its full duration.',
      );
    }
    for (const match of file.matches(SYNC_HASH)) {
      emit(
        match.index,
        match.text.length,
        match.text.trim().replace(/\($/, '()'),
        'bcrypt is intentionally expensive; the synchronous form blocks every other request for tens of milliseconds.',
      );
    }
    for (const match of file.matches(SYNC_EXEC)) {
      emit(
        match.index,
        match.text.length,
        match.text.trim().replace(/\($/, '()'),
        'The whole process waits for the child to exit before it can serve anything else.',
      );
    }
  },
});
