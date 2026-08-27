import type { Confidence, DetectedFramework, FrameworkId } from '../types/core.js';
import type { PackageJson } from './package-json.js';

/**
 * Declarative framework detection.
 *
 * Each entry maps a framework to the dependency names and file paths that
 * imply it. Detection deliberately prefers dependency evidence (`high`
 * confidence) over file-name evidence (`medium`) so that a stray
 * `next.config.js` in an unrelated repo does not turn on every Next.js rule.
 */
interface FrameworkSignature {
  readonly id: FrameworkId;
  readonly name: string;
  /** Exact dependency names implying this framework. */
  readonly dependencies?: readonly string[];
  /** Dependency name prefixes (e.g. `@supabase/`). */
  readonly dependencyPrefixes?: readonly string[];
  /** Repository-relative POSIX paths (matched exactly or as a directory prefix). */
  readonly files?: readonly string[];
  /** Directory prefixes implying this framework, e.g. `app/`. */
  readonly directories?: readonly string[];
}

const SIGNATURES: readonly FrameworkSignature[] = [
  {
    id: 'next',
    name: 'Next.js',
    dependencies: ['next'],
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'],
  },
  { id: 'react', name: 'React', dependencies: ['react'] },
  {
    id: 'vite',
    name: 'Vite',
    dependencies: ['vite'],
    files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'],
  },
  { id: 'express', name: 'Express', dependencies: ['express'] },
  { id: 'fastify', name: 'Fastify', dependencies: ['fastify'] },
  { id: 'hono', name: 'Hono', dependencies: ['hono'] },
  { id: 'nestjs', name: 'NestJS', dependencies: ['@nestjs/core'] },
  { id: 'remix', name: 'Remix', dependencyPrefixes: ['@remix-run/'] },
  { id: 'astro', name: 'Astro', dependencies: ['astro'] },
  { id: 'sveltekit', name: 'SvelteKit', dependencies: ['@sveltejs/kit'] },
  { id: 'nuxt', name: 'Nuxt', dependencies: ['nuxt'] },
  {
    id: 'supabase',
    name: 'Supabase',
    dependencyPrefixes: ['@supabase/'],
    directories: ['supabase/'],
  },
  {
    id: 'firebase',
    name: 'Firebase',
    dependencies: ['firebase', 'firebase-admin'],
    files: ['firebase.json', 'firestore.rules'],
  },
  {
    id: 'prisma',
    name: 'Prisma',
    dependencies: ['prisma', '@prisma/client'],
    files: ['prisma/schema.prisma'],
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    dependencies: ['drizzle-orm'],
    files: ['drizzle.config.ts'],
  },
  { id: 'mongoose', name: 'Mongoose', dependencies: ['mongoose'] },
  { id: 'stripe', name: 'Stripe', dependencies: ['stripe', '@stripe/stripe-js'] },
  { id: 'openai', name: 'OpenAI API', dependencies: ['openai'] },
  { id: 'anthropic', name: 'Anthropic API', dependencies: ['@anthropic-ai/sdk'] },
  {
    id: 'vercel-ai-sdk',
    name: 'Vercel AI SDK',
    dependencies: ['ai'],
    dependencyPrefixes: ['@ai-sdk/'],
  },
  {
    id: 'langchain',
    name: 'LangChain',
    dependencyPrefixes: ['@langchain/'],
    dependencies: ['langchain'],
  },
  { id: 'trpc', name: 'tRPC', dependencyPrefixes: ['@trpc/'] },
  { id: 'vitest', name: 'Vitest', dependencies: ['vitest'] },
  { id: 'jest', name: 'Jest', dependencies: ['jest', '@jest/globals'] },
  { id: 'playwright', name: 'Playwright', dependencies: ['@playwright/test', 'playwright'] },
  { id: 'cypress', name: 'Cypress', dependencies: ['cypress'] },
  { id: 'tailwind', name: 'Tailwind CSS', dependencies: ['tailwindcss'] },
];

export interface DetectionInput {
  readonly pkg: PackageJson | null;
  /** Every repository-relative POSIX path discovered by the walker. */
  readonly paths: readonly string[];
}

function versionOf(pkg: PackageJson | null, names: readonly string[]): string | null {
  if (pkg === null) return null;
  for (const group of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (group === undefined) continue;
    for (const name of names) {
      const v = group[name];
      if (v !== undefined) return v;
    }
  }
  return null;
}

/**
 * Detect frameworks, services and test tooling.
 *
 * Also derives the two Next.js router variants, which materially change which
 * auth and routing rules apply.
 */
export function detectFrameworks(input: DetectionInput): DetectedFramework[] {
  const depNames = new Set<string>();
  if (input.pkg !== null) {
    for (const group of [
      input.pkg.dependencies,
      input.pkg.devDependencies,
      input.pkg.peerDependencies,
      input.pkg.optionalDependencies,
    ]) {
      if (group === undefined) continue;
      for (const name of Object.keys(group)) depNames.add(name);
    }
  }

  const pathSet = new Set(input.paths);
  const detected: DetectedFramework[] = [];

  for (const sig of SIGNATURES) {
    const signals: string[] = [];
    let confidence: Confidence | null = null;
    const matchedDeps: string[] = [];

    for (const dep of sig.dependencies ?? []) {
      if (depNames.has(dep)) {
        signals.push(`dependency:${dep}`);
        matchedDeps.push(dep);
        confidence = 'high';
      }
    }
    for (const prefix of sig.dependencyPrefixes ?? []) {
      for (const name of depNames) {
        if (name.startsWith(prefix)) {
          signals.push(`dependency:${name}`);
          matchedDeps.push(name);
          confidence = 'high';
          break;
        }
      }
    }
    for (const file of sig.files ?? []) {
      if (pathSet.has(file)) {
        signals.push(`file:${file}`);
        confidence ??= 'medium';
      }
    }
    for (const dir of sig.directories ?? []) {
      if (input.paths.some((p) => p.startsWith(dir))) {
        signals.push(`directory:${dir}`);
        confidence ??= 'medium';
      }
    }

    if (confidence !== null) {
      detected.push({
        id: sig.id,
        name: sig.name,
        version: versionOf(
          input.pkg,
          matchedDeps.length > 0 ? matchedDeps : (sig.dependencies ?? []),
        ),
        confidence,
        signals,
      });
    }
  }

  const hasNext = detected.some((f) => f.id === 'next');
  if (hasNext) {
    const appRouter = input.paths.filter(
      (p) =>
        /^(?:src\/)?app\/.*\/(?:page|route|layout)\.(?:t|j)sx?$/.test(p) ||
        /^(?:src\/)?app\/(?:page|route|layout)\.(?:t|j)sx?$/.test(p),
    );
    const pagesRouter = input.paths.filter((p) => /^(?:src\/)?pages\/.+\.(?:t|j)sx?$/.test(p));
    if (appRouter.length > 0) {
      detected.push({
        id: 'next-app-router',
        name: 'Next.js App Router',
        version: versionOf(input.pkg, ['next']),
        confidence: 'high',
        signals: appRouter.slice(0, 3).map((p) => `file:${p}`),
      });
    }
    if (pagesRouter.length > 0) {
      detected.push({
        id: 'next-pages-router',
        name: 'Next.js Pages Router',
        version: versionOf(input.pkg, ['next']),
        confidence: 'high',
        signals: pagesRouter.slice(0, 3).map((p) => `file:${p}`),
      });
    }
  }

  return detected;
}
