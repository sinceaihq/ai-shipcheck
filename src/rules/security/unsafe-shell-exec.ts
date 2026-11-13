import type { SourceFile } from '../../analysis/source-file.js';
import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** `exec`, `execSync` and `spawn`-with-shell all run through a shell. */
const SHELL_CALL =
  /\b(?:child_process\s*\.\s*)?(exec|execSync|spawnSync|spawn|execFile|execFileSync)\s*\(/g;

export default defineRule({
  meta: {
    id: 'security/unsafe-shell-exec',
    category: 'security',
    title: 'Shell command built from interpolated values',
    severity: 'critical',
    confidence: 'medium',
    blocker: true,
    description:
      'A shell command is assembled with template interpolation or string concatenation. If any interpolated value reaches this code from a request, a filename, or a third-party API, an attacker can append their own command and run it with the privileges of the server process.',
    remediation:
      'Use execFile or spawn with an explicit argument array and no shell, so arguments are passed to the process directly instead of being parsed by a shell. Validate any value that determines which binary runs against an allowlist.',
    references: [
      'https://owasp.org/Top10/A03_2021-Injection/',
      'https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback',
    ],
    tags: ['injection', 'command-injection', 'owasp-a03'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    if (!file.code.includes('child_process') && !file.content.includes('node:child_process'))
      return;

    let reported = 0;
    for (const match of file.matches(SHELL_CALL)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const fn = match.groups[0];
      if (fn === undefined) continue;

      // execFile/spawn with an argument array do not use a shell unless asked.
      const argsRegion = file.content.slice(match.index, match.index + 400);
      const usesShellOption = /shell\s*:\s*(?:true|['"])/.test(argsRegion);
      const isShellFn = fn === 'exec' || fn === 'execSync';
      if (!isShellFn && !usesShellOption) continue;

      const command = firstArgument(file, match.index);
      if (command === null || !hasInterpolation(command)) continue;

      reported++;
      ctx.report({
        title: `${fn}() runs a shell command built from interpolated values`,
        confidence: 'medium',
        explanation: `${file.path} builds the command passed to ${fn}() by interpolation. A value such as \`; rm -rf /\` inside any interpolated expression becomes a second command.`,
        evidence: [file.evidenceAt(match.index, { length: match.text.length })],
      });
    }
  },
});

/** Longest command expression worth reading; anything longer is not a call. */
const MAX_COMMAND_LENGTH = 4000;

/**
 * Source text of the first argument of the call at `offset` - the command.
 *
 * The extent is found on the masked view, where string, template and comment
 * bodies are blanked, so a comma or a parenthesis inside the command text
 * cannot end it early. Reading a fixed window instead reported a constant
 * command whenever the *next* statement, or the callback, happened to contain
 * a template literal.
 *
 * @returns null when the argument list is not closed within a sane distance,
 *   which is a malformed file rather than a command to judge.
 */
function firstArgument(file: SourceFile, offset: number): string | null {
  const code = file.code;
  const open = code.indexOf('(', offset);
  if (open === -1) return null;
  const limit = Math.min(code.length, open + 1 + MAX_COMMAND_LENGTH);
  let depth = 0;
  for (let i = open + 1; i < limit; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return file.content.slice(open + 1, i);
      depth--;
    } else if (ch === ',' && depth === 0) {
      return file.content.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * True when a command expression is a template literal with substitutions or
 * a concatenation involving a non-literal.
 */
function hasInterpolation(command: string): boolean {
  if (/`[^`]*\$\{/.test(command)) return true;
  if (/['"][^'"\n]*['"]\s*\+/.test(command)) return true;
  if (/\+\s*[A-Za-z_$][\w$.]*\s*(?:[,)]|$)/.test(command)) return true;
  return false;
}
