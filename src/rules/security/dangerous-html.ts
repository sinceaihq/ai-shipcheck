import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const DANGEROUS_HTML = /dangerouslySetInnerHTML\s*=\s*\{\{/g;
const INNER_HTML_ASSIGN = /\.\s*innerHTML\s*=/g;
const OUTER_HTML_ASSIGN = /\.\s*outerHTML\s*=/g;
const DOCUMENT_WRITE = /document\s*\.\s*write(?:ln)?\s*\(/g;
const SANITIZER = /\b(?:DOMPurify|sanitize\w*|sanitizeHtml|xss\(|purify|createDOMPurify)/i;

/** `__html` assigned a plain string literal, with nothing interpolated in. */
const STATIC_HTML_LITERAL = /__html\s*:\s*(?:'[^'\n]*'|"[^"\n]*"|`[^`$]*`)\s*[,}]/;

export default defineRule({
  meta: {
    id: 'security/dangerous-html',
    category: 'security',
    title: 'Raw HTML injected without sanitisation',
    severity: 'high',
    confidence: 'medium',
    description:
      'Assigning unsanitised HTML through dangerouslySetInnerHTML, innerHTML, outerHTML or document.write turns any attacker-influenced string into executable script in the visitor browser. This is the classic cross-site scripting sink.',
    remediation:
      'Render text as text - React escapes it automatically. When HTML really is required, sanitise it first with a maintained sanitiser such as DOMPurify, and restrict the allowed tags and attributes.',
    references: [
      'https://owasp.org/www-community/attacks/xss/',
      'https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html',
    ],
    tags: ['xss', 'owasp-a03'],
  },

  checkFile(file, ctx) {
    if (isNonProductionFile(file)) return;
    let reported = 0;

    const emit = (index: number, length: number, what: string, remediation: string): void => {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      // A sanitiser applied on the same line (or the line above) is strong
      // evidence the developer already handled this.
      const line = file.lineAt(index);
      const nearby = `${file.lineText(line - 1)}\n${file.lineText(line)}\n${file.lineText(line + 1)}`;
      if (SANITIZER.test(nearby)) return;
      reported++;
      ctx.report({
        title: `${what} used without a visible sanitiser`,
        explanation: `${file.path} passes a value to ${what} with no sanitisation on or around that line. If any part of that value can be influenced by user input, stored data or a third-party API, it becomes script execution in the browser.`,
        remediation,
        evidence: [file.evidenceAt(index, { length })],
      });
    };

    for (const m of file.matches(DANGEROUS_HTML)) {
      // `__html: '<p>static</p>'` is a constant in the source. There is no
      // input to inject, so there is nothing to sanitise.
      if (STATIC_HTML_LITERAL.test(file.content.slice(m.index, m.index + 400))) continue;
      emit(
        m.index,
        m.text.length,
        'dangerouslySetInnerHTML',
        'Render the value as text, or sanitise it with DOMPurify before passing it to dangerouslySetInnerHTML.',
      );
    }
    for (const m of file.matches(INNER_HTML_ASSIGN)) {
      emit(
        m.index,
        m.text.length,
        'innerHTML',
        'Use textContent for text, or sanitise the HTML with DOMPurify before assigning it.',
      );
    }
    for (const m of file.matches(OUTER_HTML_ASSIGN)) {
      emit(
        m.index,
        m.text.length,
        'outerHTML',
        'Build the replacement with DOM APIs, or sanitise the HTML with DOMPurify first.',
      );
    }
    for (const m of file.matches(DOCUMENT_WRITE)) {
      emit(
        m.index,
        m.text.length,
        'document.write',
        'Replace document.write with DOM construction; it also blocks parsing and is ignored in modern async contexts.',
      );
    }
  },
});
