import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements, hasSpread } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Input types that are self-describing and need no label. */
const UNLABELLED_TYPES = /^(?:hidden|submit|reset|button|image)$/i;

export default defineRule({
  meta: {
    id: 'accessibility/form-control-missing-label',
    category: 'accessibility',
    title: 'Form control with no accessible label',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A form field has no associated label, aria-label or aria-labelledby. A screen reader announces it as "edit text, blank" with no indication of what belongs in it. Placeholder text does not substitute: it disappears the moment the user starts typing, and is not reliably announced.',
    remediation:
      'Associate a <label htmlFor="fieldId"> with the control, or add aria-label when a visible label genuinely does not fit the design. Keep the placeholder as an example of the format, not as the field name.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html',
      'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label',
    ],
    tags: ['wcag-3.3.2', 'a11y', 'forms'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    // A label whose htmlFor matches the control's id is the usual pattern; the
    // ids are collected first so ordering in the file does not matter.
    const labelledIds = new Set<string>();
    for (const label of findElements(file, ['label', 'Label'])) {
      const htmlFor =
        attributeValue(label.attributes, 'htmlFor') ?? attributeValue(label.attributes, 'for');
      if (htmlFor !== null && htmlFor.length > 0) labelledIds.add(htmlFor.trim());
    }

    for (const element of findElements(file, ['input', 'textarea', 'select'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (hasSpread(element.attributes)) continue;

      const type = attributeValue(element.attributes, 'type');
      if (type !== null && UNLABELLED_TYPES.test(type.trim())) continue;

      if (attributeValue(element.attributes, 'aria-label') !== null) continue;
      if (attributeValue(element.attributes, 'aria-labelledby') !== null) continue;
      if (attributeValue(element.attributes, 'title') !== null) continue;

      const id = attributeValue(element.attributes, 'id');
      if (id !== null && labelledIds.has(id.trim())) continue;
      // `{...register("email")}` style form libraries are handled by hasSpread,
      // but an id from an expression cannot be resolved statically.
      if (id !== null && id.includes('{')) continue;

      reported++;
      const hasPlaceholder = attributeValue(element.attributes, 'placeholder') !== null;
      ctx.report({
        title: `<${element.tag}> has no accessible label`,
        explanation: hasPlaceholder
          ? `${file.path} renders a <${element.tag}> with only a placeholder and no label. The placeholder disappears as soon as the user types, leaving the field unidentified.`
          : `${file.path} renders a <${element.tag}> with no label, aria-label or aria-labelledby. Screen readers announce it with no indication of what it is for.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
