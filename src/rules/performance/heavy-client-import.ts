import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile, MAX_FINDINGS_PER_RULE } from '../helpers.js';

/** Packages that are large and have a materially smaller alternative. */
const HEAVY_PACKAGES: Readonly<Record<string, string>> = {
  lodash: 'Import the single function you need (lodash/debounce), or use the native equivalent.',
  moment:
    'Moment is in maintenance mode and is not tree-shakeable. Use date-fns, dayjs, or Intl.DateTimeFormat.',
  'aws-sdk':
    'The v2 SDK bundles every service. Use the modular @aws-sdk/client-* packages, and only on the server.',
  'chart.js': 'Load charting libraries dynamically so they are not in the initial bundle.',
  'monaco-editor':
    'Load the editor with a dynamic import so it is fetched only when the editor is opened.',
  three: 'Load 3D libraries with a dynamic import so they stay out of the initial bundle.',
  'pdfjs-dist': 'Load PDF rendering dynamically; it is one of the largest common dependencies.',
};

const BARE_IMPORT = /(?:import\s+[^;'"]{0,120}from\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

export default defineRule({
  meta: {
    id: 'performance/heavy-client-import',
    category: 'performance',
    title: 'Large dependency imported into client code',
    severity: 'low',
    confidence: 'medium',
    description:
      'A large package is imported wholesale into code that ships to the browser. Every visitor downloads, parses and executes it before the page becomes interactive, on whatever connection they happen to have.',
    remediation:
      'Import only the specific function you use, switch to a smaller equivalent, or load the module with a dynamic import so it is fetched on demand.',
    tags: ['bundle-size'],
  },

  appliesTo(index) {
    if (!index.profile.hasClientCode) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No browser-side code was found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (!file.isClient && !file.isClientComponent) return;
    if (isNonProductionFile(file)) return;
    let reported = 0;

    for (const match of file.matches(BARE_IMPORT)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const specifier = match.groups[0];
      if (specifier === undefined) continue;
      const advice = HEAVY_PACKAGES[specifier];
      if (advice === undefined) continue;

      reported++;
      ctx.report({
        title: `"${specifier}" is imported in full into client code`,
        explanation: `${file.path} imports all of "${specifier}" into a module that ships to the browser. The whole package ends up in the bundle every visitor downloads.`,
        remediation: advice,
        evidence: [file.evidenceAt(match.index, { length: Math.min(match.text.length, 120) })],
      });
    }
  },
});
