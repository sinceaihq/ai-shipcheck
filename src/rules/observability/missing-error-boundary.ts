import { defineRule } from '../../core/define-rule.js';

const ERROR_BOUNDARY =
  /(?:componentDidCatch|getDerivedStateFromError|ErrorBoundary|react-error-boundary|withErrorBoundary)/;

export default defineRule({
  meta: {
    id: 'observability/missing-error-boundary',
    category: 'observability',
    title: 'No React error boundary',
    severity: 'medium',
    confidence: 'medium',
    requiresFrameworks: ['react', 'next'],
    description:
      'An uncaught render error in React unmounts the entire component tree - the user gets a blank white page with no explanation and no way back. An error boundary catches it, shows a recoverable UI, and gives you somewhere to report the error from.',
    remediation:
      'In the Next.js App Router, add an error.tsx to each route segment (and a global-error.tsx at the root). Elsewhere, wrap the app in an error boundary component and report the caught error to your monitoring service from its handler.',
    references: [
      'https://nextjs.org/docs/app/building-your-application/routing/error-handling',
      'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
    ],
    tags: ['error-handling', 'react'],
  },

  appliesTo(index) {
    if (!index.profile.hasClientCode) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No browser-side React code was found in this project.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const hasAppRouterErrorFile = ctx.index.allPaths.some((p) =>
      /(?:^|\/)(?:error|global-error)\.[cm]?[jt]sx?$/.test(p),
    );
    if (hasAppRouterErrorFile) return;

    if (ctx.index.hasDependency('react-error-boundary')) return;
    if (ctx.index.files.some((f) => ERROR_BOUNDARY.test(f.code))) return;

    const isAppRouter = ctx.index.hasFramework('next-app-router');
    ctx.report({
      explanation: isAppRouter
        ? 'This App Router project has no error.tsx or global-error.tsx anywhere, and no error boundary component. An exception thrown while rendering any route replaces the page with a blank screen.'
        : 'No error boundary was found in this React application. An exception thrown during render unmounts the whole tree and leaves the user with a blank page.',
      remediation: isAppRouter
        ? 'Add app/error.tsx for route-level recovery and app/global-error.tsx as a last resort, and report the error from each one.'
        : 'Wrap the application root in an error boundary - react-error-boundary is a small, well-maintained option - and report caught errors to your monitoring service.',
      evidence: [
        {
          file: ctx.index.hasFramework('next') ? 'app' : 'package.json',
          line: 1,
          column: 1,
          snippet: 'No error boundary found',
          note: isAppRouter
            ? 'no error.tsx / global-error.tsx in any route segment'
            : 'no error boundary component',
        },
      ],
    });
  },
});
