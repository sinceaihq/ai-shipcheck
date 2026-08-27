import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const ELEMENTS = [
  'div',
  'span',
  'a',
  'button',
  'input',
  'section',
  'li',
  'p',
  'label',
  'textarea',
  'select',
];

export default defineRule({
  meta: {
    id: 'accessibility/positive-tabindex',
    category: 'accessibility',
    title: 'Positive tabIndex disrupts focus order',
    severity: 'low',
    confidence: 'high',
    description:
      'A tabIndex greater than zero pulls the element to the front of the tab sequence, ahead of everything in document order. One such element reorders the whole page for keyboard users, and the effect compounds as more are added - the resulting order rarely matches what anyone expects.',
    remediation:
      'Use tabIndex={0} to make an element focusable in its natural position, and tabIndex={-1} to make it focusable only programmatically. If the tab order is wrong, fix the order of the markup instead.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html',
      'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex',
    ],
    tags: ['wcag-2.4.3', 'a11y', 'keyboard'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    for (const element of findElements(file, ELEMENTS)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const raw =
        attributeValue(element.attributes, 'tabIndex') ??
        attributeValue(element.attributes, 'tabindex');
      if (raw === null) continue;
      const value = Number(raw.replace(/[{}\s"']/g, ''));
      if (!Number.isFinite(value) || value <= 0) continue;

      reported++;
      ctx.report({
        title: `tabIndex={${value}} moves this element ahead of the natural focus order`,
        explanation: `${file.path} sets tabIndex={${value}} on a <${element.tag}>. Positive values are visited before every tabIndex={0} element on the page, regardless of where they appear.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
