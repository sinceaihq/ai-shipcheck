import { defineRule } from '../../core/define-rule.js';
import { attributeValue, closingTagEnd, findElements, hasSpread } from './jsx.js';
import { isNonProductionFile, requiresRenderedUi, MAX_FINDINGS_PER_RULE } from '../helpers.js';

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

  appliesTo: requiresRenderedUi,

  checkFile(file, ctx) {
    if (!file.isJsx || isNonProductionFile(file)) return;
    let reported = 0;

    // A label whose htmlFor matches the control's id is the usual pattern; the
    // ids are collected first so ordering in the file does not matter.
    const labelledIds = new Set<string>();
    for (const label of findElements(file, ['label', 'Label'])) {
      const htmlFor =
        attributeValue(label.attributes, 'htmlFor') ?? attributeValue(label.attributes, 'for');
      if (htmlFor !== null && htmlFor.length > 0) labelledIds.add(htmlFor.trim());
    }

    // `<label>Email <input /></label>` associates the two implicitly and is
    // perfectly valid HTML. The ranges of every label element are collected so
    // a control nested inside one can be recognised as already labelled.
    const labelRanges = findElements(file, ['label', 'Label']).map((label) => ({
      start: label.start,
      end: closingTagEnd(file.content, label.end, label.tag),
    }));

    for (const element of findElements(file, ['input', 'textarea', 'select'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (hasSpread(element.attributes)) continue;

      const type = attributeValue(element.attributes, 'type');
      if (type !== null && UNLABELLED_TYPES.test(type.trim())) continue;

      if (attributeValue(element.attributes, 'aria-label') !== null) continue;
      if (attributeValue(element.attributes, 'aria-labelledby') !== null) continue;
      if (attributeValue(element.attributes, 'title') !== null) continue;

      // A control that is hidden, or removed from the tab order, is not a
      // control the user interacts with - it is usually triggered by a button
      // elsewhere. Labelling it would not help anyone.
      if (attributeValue(element.attributes, 'hidden') !== null) continue;
      if (attributeValue(element.attributes, 'aria-hidden') !== null) continue;
      const tabIndex = attributeValue(element.attributes, 'tabIndex');
      if (tabIndex !== null && Number(tabIndex.replace(/[{}\s"']/g, '')) < 0) continue;

      if (labelRanges.some((range) => element.start > range.start && element.start < range.end)) {
        continue;
      }

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
