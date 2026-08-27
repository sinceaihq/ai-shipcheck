import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements, hasSpread } from './jsx.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Text content that is not a real accessible name. */
const EMPTY_CONTENT = /^[\s{}]*$/;

export default defineRule({
  meta: {
    id: 'accessibility/inaccessible-interactive-element',
    category: 'accessibility',
    title: 'Interactive element with no accessible name',
    severity: 'medium',
    confidence: 'medium',
    description:
      'A button or link contains only an icon, with no text and no aria-label. Screen readers announce it as "button" with nothing else - the user is told a control exists but not what it does. Voice control users cannot address it by name either.',
    remediation:
      'Add aria-label describing the action ("Close dialog", "Delete invoice"), or include visually hidden text inside the element. Mark the icon itself aria-hidden="true" so it is not announced separately.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
      'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html',
    ],
    tags: ['wcag-4.1.2', 'a11y'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx || file.role === 'test') return;
    let reported = 0;

    for (const element of findElements(file, ['button', 'a'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (element.selfClosing) continue;
      if (hasSpread(element.attributes)) continue;
      if (attributeValue(element.attributes, 'aria-label') !== null) continue;
      if (attributeValue(element.attributes, 'aria-labelledby') !== null) continue;
      if (attributeValue(element.attributes, 'title') !== null) continue;

      const closing = findClosingTag(file.content, element.end, element.tag);
      if (closing === -1) continue;
      const inner = file.content.slice(element.end, closing);

      // Any bare text, or a child with its own label, counts as a name.
      const withoutTags = inner.replace(/<[^>]*>/g, ' ');
      if (!EMPTY_CONTENT.test(withoutTags)) continue;
      if (/aria-label|children|\{\s*(?:label|title|text|name)\b/.test(inner)) continue;
      // An icon-only control is the case this rule is about; an empty element
      // with no children at all is more likely a placeholder than a bug.
      if (inner.trim().length === 0) continue;

      reported++;
      ctx.report({
        title: `<${element.tag}> contains only an icon and has no accessible name`,
        explanation: `${file.path} renders a <${element.tag}> whose content is an icon with no text and no aria-label. Assistive technology announces it as an unnamed control.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});

/** Offset of the matching closing tag, or -1. */
function findClosingTag(content: string, from: number, tag: string): number {
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  const close = new RegExp(`</${tag}\\s*>`, 'g');
  open.lastIndex = from;
  close.lastIndex = from;
  let depth = 1;
  let cursor = from;
  for (let guard = 0; guard < 200; guard++) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(content);
    const nextClose = close.exec(content);
    if (nextClose === null) return -1;
    if (nextOpen !== null && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth--;
    if (depth === 0) return nextClose.index;
    cursor = nextClose.index + nextClose[0].length;
  }
  return -1;
}
