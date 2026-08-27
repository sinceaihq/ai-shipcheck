import { defineRule } from '../../core/define-rule.js';
import { attributeValue, findElements } from './jsx.js';

export default defineRule({
  meta: {
    id: 'accessibility/missing-html-lang',
    category: 'accessibility',
    title: 'Root <html> element has no lang attribute',
    severity: 'low',
    confidence: 'high',
    requiresFrameworks: ['next'],
    description:
      'Without a lang attribute, screen readers guess the document language - usually from the user system settings - and read the page with the wrong pronunciation rules. It also affects automatic translation, hyphenation and font selection.',
    remediation:
      'Set lang on the root html element in your layout: <html lang="en">. For a localised app, drive the value from the active locale.',
    references: ['https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html'],
    tags: ['wcag-3.1.1', 'a11y'],
  },

  appliesTo(index) {
    const roots = index.findFiles(
      (f) => f.isJsx && (f.role === 'next-app-special' || /_document\.[cm]?[jt]sx?$/.test(f.path)),
    );
    if (roots.length === 0) {
      return {
        applicable: false,
        status: 'unassessed',
        reason:
          'No root layout or _document file was found, so the html element could not be inspected.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (!file.isJsx) return;
    if (file.role !== 'next-app-special' && !/_document\.[cm]?[jt]sx?$/.test(file.path)) return;

    for (const element of findElements(file, ['html', 'Html'])) {
      if (attributeValue(element.attributes, 'lang') !== null) continue;
      ctx.report({
        explanation: `${file.path} renders the root <${element.tag}> element without a lang attribute, so assistive technology has to guess the document language.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 100) }),
        ],
      });
    }
  },
});
