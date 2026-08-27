import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';
import { attributeValue, findElements } from '../accessibility/jsx.js';

const REMOTE_OR_LOCAL_SRC = /\ssrc\s*=\s*["'{]/;

export default defineRule({
  meta: {
    id: 'performance/next-unoptimized-image',
    category: 'performance',
    title: 'Raw <img> tag in a Next.js application',
    severity: 'low',
    confidence: 'medium',
    requiresFrameworks: ['next'],
    description:
      'A plain <img> tag skips the Next.js image pipeline: no automatic resizing for the viewport, no modern format negotiation, no lazy loading, and no width/height reservation - which means the image contributes directly to layout shift as it loads.',
    remediation:
      'Use next/image with explicit width and height (or fill with a sized parent). Configure remotePatterns in next.config for external hosts. Keep a raw <img> only where the pipeline genuinely cannot help, such as inline SVG data URIs.',
    references: ['https://nextjs.org/docs/app/api-reference/components/image'],
    tags: ['images', 'core-web-vitals'],
  },

  checkFile(file, ctx) {
    if (!file.isJsx) return;
    if (isNonProductionFile(file)) return;
    // Files that already use next/image are making a deliberate exception.
    if (/from\s+['"]next\/image['"]/.test(file.content)) return;

    let reported = 0;
    for (const element of findElements(file, ['img'])) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (!REMOTE_OR_LOCAL_SRC.test(element.text)) continue;
      if (/data:image\//.test(element.text)) continue;

      // The concrete, measurable harm of a raw <img> is layout shift, and that
      // only happens when the browser cannot reserve space for it. An <img>
      // with explicit dimensions is a deliberate, defensible choice; reporting
      // it too turns this into a style lint.
      const hasWidth = attributeValue(element.attributes, 'width') !== null;
      const hasHeight = attributeValue(element.attributes, 'height') !== null;
      const hasAspect = /aspect-|w-\d|h-\d|size-\d/.test(element.attributes);
      if ((hasWidth && hasHeight) || hasAspect) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} renders a raw <img> with no width and height. The browser cannot reserve space for it, so the page shifts as it loads, and Next.js will not resize, reformat or lazy-load it either.`,
        evidence: [
          file.evidenceAt(element.start, { length: Math.min(element.end - element.start, 140) }),
        ],
      });
    }
  },
});
