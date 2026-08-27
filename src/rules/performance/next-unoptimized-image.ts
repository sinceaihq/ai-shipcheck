import { defineRule } from '../../core/define-rule.js';
import { MAX_FINDINGS_PER_RULE } from '../helpers.js';

const IMG_TAG = /<img\s[^>]{0,400}>/g;
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
    if (file.role === 'test') return;
    // Files that already use next/image are making a deliberate exception.
    if (/from\s+['"]next\/image['"]/.test(file.content)) return;

    let reported = 0;
    for (const match of file.matches(IMG_TAG)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      if (!REMOTE_OR_LOCAL_SRC.test(match.text)) continue;
      if (/data:image\//.test(match.text)) continue;

      reported++;
      ctx.report({
        explanation: `${file.path} renders a raw <img>. Next.js will not resize, reformat or lazy-load it, and without width and height it shifts the layout as it loads.`,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 140) })],
      });
    }
  },
});
