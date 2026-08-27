import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements, hasSpread } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const PLACEHOLDER_HREF = /^\s*(?:#|javascript:void\(0\)|javascript:;|)\s*$/i;

export default defineRule({
  meta: {
    id: 'accessibility/invalid-anchor',
    category: 'accessibility',
    title: 'Anchor used as a button',
    severity: 'medium',
    confidence: 'high',
    description:
      'An anchor has a placeholder href (or none) and does its work in an onClick handler. Screen readers announce it as a link, so users expect navigation and are told nothing about what will actually happen; middle-click and "open in new tab" do nothing; and with no href it is not even focusable.',
    remediation:
      'If it performs an action, use a <button type="button">. If it navigates, give it a real href so it behaves like a link for every input method. Anchors are for going places, buttons are for doing things.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
      'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a',
    ],
    tags: ['wcag-4.1.2', 'a11y', 'semantics'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    for (const element of findElements(file, ['a'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (hasSpread(element.attributes)) continue;
      if (attributeValue(element.attributes, 'onClick') === null) continue;

      const href = attributeValue(element.attributes, 'href');
      if (href !== null && !PLACEHOLDER_HREF.test(href) && !href.includes('{')) continue;
      if (href !== null && href.includes('{')) continue; // dynamic, cannot judge

      reported++;
      ctx.report({
        title:
          href === null
            ? '<a> with onClick has no href'
            : `<a href="${href.trim()}"> is used as a button`,
        explanation:
          href === null
            ? `${file.path} attaches a click handler to an anchor with no href. Without one the element is not keyboard focusable and is not exposed as a link or a button.`
            : `${file.path} uses an anchor with a placeholder href to trigger an action. It is announced as a link, so users are told it will navigate somewhere when it will not.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
