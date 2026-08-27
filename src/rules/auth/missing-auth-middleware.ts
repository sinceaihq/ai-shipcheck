import { defineRule } from '../../core/define-rule.js';
import { hasAuthSignal } from '../helpers.js';
import { toRoutePath } from '../security/exposed-debug-route.js';

/** Path segments that mark an area of the app as private. */
const PRIVATE_AREA =
  /(?:^|\/)(?:admin|dashboard|account|settings|billing|console|manage|internal|studio|app)(?:\/|$)/;

export default defineRule({
  meta: {
    id: 'auth/missing-auth-middleware',
    category: 'auth',
    title: 'Private area has no route-level authentication gate',
    severity: 'medium',
    confidence: 'medium',
    requiresFrameworks: ['next'],
    description:
      'Pages under a clearly private path prefix are reachable without any authentication gate: there is no middleware matcher covering them, and the pages themselves contain no session check. In Next.js nothing is protected by default, so an unauthenticated visitor renders the page.',
    remediation:
      'Add a middleware.ts with a matcher covering the private prefixes and redirect unauthenticated requests, or resolve the session in the layout for that segment and redirect there. Middleware alone is not sufficient for data access - keep enforcing authorisation in the route handlers too.',
    references: [
      'https://nextjs.org/docs/app/building-your-application/routing/middleware',
      'https://nextjs.org/docs/app/guides/authentication',
    ],
    tags: ['authorization', 'nextjs'],
  },

  appliesTo(index) {
    const pages = index.withRole('next-app-page', 'next-pages-page');
    if (pages.length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No Next.js pages were found in this project.',
      };
    }
    if (pages.filter((p) => PRIVATE_AREA.test(toRoutePath(p.path))).length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No pages under a private path prefix (admin, dashboard, account, ...) were found.',
      };
    }
    return { applicable: true };
  },

  checkProject(ctx) {
    const middleware = ctx.index.withRole('next-middleware');
    const middlewareGuards = middleware.some((m) => hasAuthSignal(m.text));

    const privatePages = ctx.index
      .withRole('next-app-page', 'next-pages-page')
      .filter((p) => PRIVATE_AREA.test(toRoutePath(p.path)));

    // Middleware that authenticates and matches everything is enough.
    if (middlewareGuards) {
      const matcher = middleware.map((m) => m.text).join('\n');
      const coversAll = !matcher.includes('matcher') || /matcher\s*:\s*\[?\s*['"][/]/.test(matcher);
      if (coversAll) return;
    }

    const unguarded = privatePages.filter((page) => {
      if (hasAuthSignal(page.text)) return false;
      // A layout in the same segment may hold the check.
      const segment = page.path.slice(0, page.path.lastIndexOf('/'));
      const layouts = ctx.index.findFiles(
        (f) =>
          f.role === 'next-app-special' &&
          f.path.startsWith(segment.split('/').slice(0, -1).join('/')),
      );
      return !layouts.some((l) => hasAuthSignal(l.text));
    });

    if (unguarded.length === 0) return;

    ctx.report({
      title: `${unguarded.length} page${unguarded.length === 1 ? '' : 's'} under a private path have no authentication gate`,
      explanation: `${unguarded
        .map((p) => toRoutePath(p.path))
        .slice(0, 5)
        .join(
          ', ',
        )}${unguarded.length > 5 ? `, +${unguarded.length - 5} more` : ''} sit under a private path prefix, but neither the pages, their layouts, nor a middleware matcher contain an authentication check. Next.js renders them for anonymous visitors.`,
      evidence: unguarded.slice(0, 5).map((p) => p.evidenceAt(0, { note: toRoutePath(p.path) })),
    });
  },
});
