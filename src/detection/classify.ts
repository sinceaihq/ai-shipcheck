/**
 * Per-file role classification.
 *
 * Rules need to know *what a file is* far more often than they need to know
 * what it contains. Classifying once, up front, keeps rules short and makes
 * their applicability decisions consistent: an "API route missing auth" rule
 * should agree with an "API route missing rate limiting" rule about what an
 * API route is.
 */

export type FileRole =
  /** `app/**\/route.ts` — Next.js App Router HTTP handler. */
  | 'next-app-route'
  /** `app/**\/page.tsx` — Next.js App Router page. */
  | 'next-app-page'
  /** `app/**\/layout.tsx`, `template.tsx`, `error.tsx`, ... */
  | 'next-app-special'
  /** `pages/api/**` — Next.js Pages Router API handler. */
  | 'next-pages-api'
  /** `pages/**` — Next.js Pages Router page. */
  | 'next-pages-page'
  /** `middleware.ts` at the project or `src` root. */
  | 'next-middleware'
  /** A module whose top of file is `'use server'`. */
  | 'server-actions'
  /** Express/Fastify/Hono server entry point or router module. */
  | 'server-module'
  /** A React component or hook module. */
  | 'react-module'
  /** SQL migration or schema file. */
  | 'sql'
  /** Prisma schema. */
  | 'prisma-schema'
  /** Test or spec file. */
  | 'test'
  /** Build/tooling configuration. */
  | 'config'
  /** CI workflow definition. */
  | 'ci'
  /** Environment file. */
  | 'env'
  /** Anything else. */
  | 'other';

export interface FileClassification {
  readonly role: FileRole;
  /** True when the module is marked `'use client'`. */
  readonly isClientComponent: boolean;
  /**
   * True when the module runs on a server: route handlers, server actions,
   * middleware, Express modules, and any non-`'use client'` App Router file.
   */
  readonly isServer: boolean;
  /** True for files that ship to the browser. */
  readonly isClient: boolean;
}

const TEST_PATH = /(?:^|\/)(?:__tests__|__test__|tests?|e2e|cypress|spec)\//;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const CONFIG_FILE =
  /(?:^|\/)(?:vite|vitest|next|nuxt|astro|svelte|tailwind|postcss|rollup|webpack|jest|playwright|cypress|drizzle|eslint|babel|tsup|esbuild|commitlint|prettier)\.config\.[cm]?[jt]s$/;

/** Directives that must appear at the very top of a module to take effect. */
function leadingDirective(content: string, directive: string): boolean {
  // Scan past leading comments and whitespace without a backtracking regex.
  let i = 0;
  const len = Math.min(content.length, 4096);
  while (i < len) {
    const ch = content[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ';') {
      i++;
      continue;
    }
    if (ch === '/' && content[i + 1] === '/') {
      while (i < len && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && content[i + 1] === '*') {
      const end = content.indexOf('*/', i + 2);
      if (end === -1) return false;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const closing = content.indexOf(ch, i + 1);
      if (closing === -1) return false;
      if (content.slice(i + 1, closing) === directive) return true;
      i = closing + 1;
      continue;
    }
    return false;
  }
  return false;
}

/**
 * Import statements that identify a module as a server entry point.
 *
 * Anchored to the start of a line so that a file which merely *mentions* one
 * of these specifiers - a code generator, a documentation example, or this
 * very list - is not misclassified as an Express application.
 */
const SERVER_FRAMEWORK_SPECIFIER =
  '(?:express|fastify|hono|koa|@hapi/hapi|@nestjs/common|@nestjs/core|node:http|node:https|http|https)';

const SERVER_IMPORT = new RegExp(
  `^[ \\t]*(?:(?:import|export)\\b[^\\n;'"\\x60]{0,160}?from\\s*|(?:const|let|var)\\s+[^\\n=]{0,80}=\\s*require\\s*\\(\\s*)['"]${SERVER_FRAMEWORK_SPECIFIER}['"]`,
  'm',
);

export interface ClassifyInput {
  /** Repository-relative POSIX path. */
  readonly path: string;
  /** File contents, or null for files that were not read. */
  readonly content: string | null;
}

/**
 * Classify a file from its path and (optionally) its contents.
 *
 * Path-based signals are checked first because they are unambiguous for the
 * frameworks we support; content signals only refine what the path left open.
 */
export function classifyFile(input: ClassifyInput): FileClassification {
  const p = input.path;
  const content = input.content ?? '';
  const isClientComponent = content.length > 0 && leadingDirective(content, 'use client');
  const isServerActions = content.length > 0 && leadingDirective(content, 'use server');

  const role = determineRole(p, content, isServerActions);

  const serverRoles: ReadonlySet<FileRole> = new Set<FileRole>([
    'next-app-route',
    'next-pages-api',
    'next-middleware',
    'server-actions',
    'server-module',
    'sql',
    'prisma-schema',
  ]);

  let isServer = serverRoles.has(role);
  if (!isServer && (role === 'next-app-page' || role === 'next-app-special')) {
    // App Router files are server components unless explicitly marked client.
    isServer = !isClientComponent;
  }
  if (!isServer && role === 'other' && !isClientComponent && !/\.[cm]?[jt]sx$/i.test(p)) {
    // A plain module that is neither a component nor marked "use client" may
    // well execute on a server - most `lib/` helpers do. Treating it as
    // server-capable is what lets timeout, retry and query rules see it.
    isServer = true;
  }

  const isClient =
    isClientComponent ||
    role === 'react-module' ||
    role === 'next-pages-page' ||
    (role === 'next-app-page' && isClientComponent);

  return { role, isClientComponent, isServer, isClient };
}

function determineRole(p: string, content: string, isServerActions: boolean): FileRole {
  const lower = p.toLowerCase();

  if (/(?:^|\/)\.env(?:\.|$)/.test(lower)) return 'env';
  if (lower.startsWith('.github/workflows/') || /(?:^|\/)\.gitlab-ci\.ya?ml$/.test(lower))
    return 'ci';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.prisma')) return 'prisma-schema';
  if (TEST_FILE.test(lower) || TEST_PATH.test(lower)) return 'test';

  const app = /^(?:src\/)?app\//.test(p);
  if (app) {
    if (/\/route\.[cm]?[jt]sx?$/.test(p)) return 'next-app-route';
    if (/\/page\.[cm]?[jt]sx?$/.test(p)) return 'next-app-page';
    if (
      /\/(?:layout|template|error|global-error|loading|not-found|default)\.[cm]?[jt]sx?$/.test(p)
    ) {
      return 'next-app-special';
    }
  }

  if (/^(?:src\/)?pages\/api\//.test(p)) return 'next-pages-api';
  if (/^(?:src\/)?pages\//.test(p) && /\.[cm]?[jt]sx?$/.test(p)) return 'next-pages-page';
  if (/^(?:src\/)?middleware\.[cm]?[jt]s$/.test(p)) return 'next-middleware';

  if (isServerActions) return 'server-actions';

  if (CONFIG_FILE.test(lower) || /(?:^|\/)(?:package|tsconfig|jsconfig)\.json$/.test(lower)) {
    return 'config';
  }

  if (content.length > 0 && SERVER_IMPORT.test(content)) {
    return 'server-module';
  }

  if (/\.[cm]?[jt]sx$/.test(lower)) return 'react-module';
  if (content.includes('from "react"') || content.includes("from 'react'")) return 'react-module';

  return 'other';
}
