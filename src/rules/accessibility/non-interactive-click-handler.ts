import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements, hasSpread } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Elements that carry no implicit interactive semantics. */
const NON_INTERACTIVE = [
  'div',
  'span',
  'li',
  'td',
  'p',
  'section',
  'article',
  'header',
  'footer',
  'tr',
];

/** Roles that make an element legitimately interactive. */
const INTERACTIVE_ROLES =
  /^(?:button|link|menuitem|option|tab|checkbox|radio|switch|treeitem|gridcell)$/;

export default defineRule({
  meta: {
    id: 'accessibility/non-interactive-click-handler',
    category: 'accessibility',
    title: 'Click handler on a non-interactive element',
    severity: 'medium',
    confidence: 'high',
    description:
      'A div or span has an onClick handler but no keyboard support. It cannot be reached with Tab, it does not respond to Enter or Space, and a screen reader announces nothing that suggests it can be activated - so the feature simply does not exist for anyone not using a mouse.',
    remediation:
      'Use a <button> - it is focusable, keyboard-activated and announced correctly with no extra work, and can be styled to look like anything. If the element must stay a div, add role="button", tabIndex={0} and an onKeyDown handler for Enter and Space.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html',
      'https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role',
    ],
    tags: ['wcag-2.1.1', 'a11y', 'keyboard'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    for (const element of findElements(file, NON_INTERACTIVE)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (hasSpread(element.attributes)) continue;
      if (attributeValue(element.attributes, 'onClick') === null) continue;

      const role = attributeValue(element.attributes, 'role');
      const hasKeyHandler =
        attributeValue(element.attributes, 'onKeyDown') !== null ||
        attributeValue(element.attributes, 'onKeyUp') !== null ||
        attributeValue(element.attributes, 'onKeyPress') !== null;
      const tabIndex = attributeValue(element.attributes, 'tabIndex');

      const roleOk = role !== null && INTERACTIVE_ROLES.test(role.trim());
      if (roleOk && hasKeyHandler && tabIndex !== null) continue;

      const missing: string[] = [];
      if (!roleOk) missing.push('an interactive role');
      if (tabIndex === null) missing.push('tabIndex');
      if (!hasKeyHandler) missing.push('a keyboard handler');

      reported++;
      ctx.report({
        title: `<${element.tag} onClick> is missing ${missing.join(', ')}`,
        explanation: `${file.path} attaches a click handler to a <${element.tag}>, which has no interactive semantics. Without ${missing.join(', ')} the control cannot be reached or activated from a keyboard.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
