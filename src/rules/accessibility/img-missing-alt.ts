import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements, hasSpread } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

export default defineRule({
  meta: {
    id: 'accessibility/img-missing-alt',
    category: 'accessibility',
    title: 'Image without an alt attribute',
    severity: 'medium',
    confidence: 'high',
    description:
      'An image has no alt attribute. Screen readers fall back to announcing the file name, which is noise at best and confusing at worst. Alt text is also what is shown when the image fails to load, and what search engines read.',
    remediation:
      'Add alt text describing what the image conveys in context. For a decorative image that adds nothing a caption does not already say, use alt="" so assistive technology skips it - an empty alt is a deliberate, meaningful choice, and a missing one is not.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html',
      'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img#alt',
    ],
    tags: ['wcag-1.1.1', 'a11y'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    for (const element of findElements(file, ['img', 'Image'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (hasSpread(element.attributes)) continue;
      if (attributeValue(element.attributes, 'alt') !== null) continue;
      if (attributeValue(element.attributes, 'aria-hidden') !== null) continue;
      // `role="presentation"` is an alternative way of marking it decorative.
      if (attributeValue(element.attributes, 'role') === 'presentation') continue;

      reported++;
      ctx.report({
        title: `<${element.tag}> has no alt attribute`,
        explanation: `${file.path} renders an image with no alt attribute. Screen reader users hear the file name instead of a description, and nothing is shown if the image fails to load.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
