import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const EVAL_CALL = /(?<![.\w$])eval\s*\(/g;
const NEW_FUNCTION = /new\s+Function\s*\(/g;
const STRING_TIMER = /\bset(?:Timeout|Interval)\s*\(\s*['"`]/g;
const VM_RUN = /\bvm\s*\.\s*run(?:InThisContext|InNewContext|InContext)\s*\(/g;

export default defineRule({
  meta: {
    id: 'security/eval-usage',
    category: 'security',
    title: 'Dynamic code execution',
    severity: 'high',
    confidence: 'high',
    description:
      'eval, new Function, string-bodied timers and the vm module compile strings into executable code. If any part of the string can be influenced by input, the process is fully compromised; even when it cannot, these constructs defeat bundler analysis and Content-Security-Policy.',
    remediation:
      'Replace dynamic evaluation with an explicit implementation: JSON.parse for data, a lookup table or switch for dispatch, and a real expression parser if user-supplied formulas are a product requirement.',
    references: [
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval',
      'https://owasp.org/Top10/A03_2021-Injection/',
    ],
    tags: ['injection', 'owasp-a03'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;
    const emit = (index: number, length: number, what: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      reported++;
      ctx.report({
        title: `${what} compiles a string into code`,
        explanation: `${file.path} uses ${what}. Any attacker-controlled fragment of the evaluated string executes with the full privileges of this process.`,
        evidence: [file.evidenceAt(index, { length })],
      });
    };

    for (const m of file.matches(EVAL_CALL)) emit(m.index, m.text.length, 'eval()');
    for (const m of file.matches(NEW_FUNCTION)) emit(m.index, m.text.length, 'new Function()');
    for (const m of file.matches(STRING_TIMER)) {
      emit(m.index, m.text.length, 'a string-bodied setTimeout/setInterval');
    }
    for (const m of file.matches(VM_RUN)) emit(m.index, m.text.length, 'the vm module');
  },
});
