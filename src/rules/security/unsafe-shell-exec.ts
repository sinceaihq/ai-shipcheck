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

      const interpolated = hasInterpolation(file.content, match.index);
      if (!interpolated) continue;

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

/**
 * True when the first argument of the call at `offset` is a template literal
 * with substitutions or a concatenation involving a non-literal.
 */
function hasInterpolation(content: string, offset: number): boolean {
  const open = content.indexOf('(', offset);
  if (open === -1) return false;
  const region = content.slice(open, open + 300);
  if (/`[^`]*\$\{/.test(region)) return true;
  if (/['"][^'"\n]*['"]\s*\+/.test(region)) return true;
  if (/\+\s*[A-Za-z_$][\w$.]*\s*[,)]/.test(region)) return true;
  return false;
}
