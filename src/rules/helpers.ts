/**
 * Shared analysis helpers for rules.
 *
 * Rules should reach for these rather than re-deriving structure. Two rules
 * that disagree about what "an authenticated route" means produce a confusing
 * report; centralising the definitions is what keeps the output coherent.
 */
import type { SourceFile } from '../analysis/source-file.js';
import type { ProjectIndex } from '../core/project-index.js';

/** HTTP methods that change state and therefore need authorisation. */
export const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const ALL_HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS', ...MUTATING_METHODS] as const;

export type HttpMethod = (typeof ALL_HTTP_METHODS)[number];

/** An exported HTTP handler found in a route module. */
export interface RouteHandler {
  readonly method: HttpMethod | 'default';
  /** Offset of the `export` keyword. */
  readonly offset: number;
  /** Source text of the handler body, or the whole file when unresolvable. */
  readonly body: string;
  /** Offset range of the body within the file. */
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

const APP_ROUTE_FUNCTION =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
const APP_ROUTE_CONST = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*(?:=|:)/g;
const PAGES_API_DEFAULT = /export\s+default\s+(?:async\s+)?(?:function|\(|[A-Za-z_$])/g;

/**
 * Extract the exported HTTP handlers from a Next.js route module.
 *
 * Handles both App Router named exports (`export async function POST`) and
 * Pages Router default exports. When a body cannot be brace-matched the whole
 * file is returned as the body so rules degrade to file-level analysis rather
 * than silently finding nothing.
 */
export function routeHandlers(file: SourceFile): RouteHandler[] {
  const handlers: RouteHandler[] = [];

  if (file.role === 'next-app-route') {
    for (const pattern of [APP_ROUTE_FUNCTION, APP_ROUTE_CONST]) {
      for (const match of file.matches(pattern)) {
        const method = match.groups[0] as HttpMethod | undefined;
        if (method === undefined) continue;
        const body = file.functionBody(match.index);
        handlers.push({
          method,
          offset: match.index,
          body: body?.text ?? file.content.slice(match.index),
          bodyStart: body?.start ?? match.index,
          bodyEnd: body?.end ?? file.content.length,
        });
      }
    }
    handlers.sort((a, b) => a.offset - b.offset);
    return handlers;
  }

  if (file.role === 'next-pages-api') {
    for (const match of file.matches(PAGES_API_DEFAULT)) {
      const body = file.functionBody(match.index);
      handlers.push({
        method: 'default',
        offset: match.index,
        body: body?.text ?? file.content.slice(match.index),
        bodyStart: body?.start ?? match.index,
        bodyEnd: body?.end ?? file.content.length,
      });
      break;
    }
  }

  return handlers;
}

/**
 * Patterns that constitute evidence a request has been authenticated or
 * authorised. Deliberately generous: a false negative (missing a real auth
 * check) costs a user nothing, while a false positive on this list produces
 * an alarming and wrong "no auth" finding.
 */
const AUTH_SIGNAL_PATTERNS: readonly RegExp[] = [
  /\bgetServerSession\s*\(/,
  /\bgetSession\s*\(/,
  /\bgetToken\s*\(/,
  /\bauth\s*\(\s*\)/,
  /\bcurrentUser\s*\(/,
  /\bgetUser\s*\(/,
  /\bgetCurrentUser\s*\(/,
  /\bgetAuth\s*\(/,
  /\brequireUser\s*\(/,
  /\brequireAuth\w*\s*\(/,
  /\bassertAuth\w*\s*\(/,
  /\bensureAuth\w*\s*\(/,
  /\bcheckAuth\w*\s*\(/,
  /\bverifyAuth\w*\s*\(/,
  /\bwithAuth\w*\s*[(<]/,
  /\bwithApiAuth\w*\s*\(/,
  /\bprotectedProcedure\b/,
  /\bauthedProcedure\b/,
  /\bisAuthenticated\b/,
  /\bauthorize\s*\(/,
  /\bcan\s*\(\s*['"]/,
  /\bability\.\w+\s*\(/,
  /\bsession\s*(?:\?\.)?\.user\b/,
  /\breq\s*\.\s*user\b/,
  /\brequest\s*\.\s*user\b/,
  /\bctx\s*\.\s*(?:user|session)\b/,
  /\blocals\s*\.\s*(?:user|session)\b/,
  /\bjwt\s*\.\s*verify\s*\(/,
  /\bjwtVerify\s*\(/,
  /\bverifyIdToken\s*\(/,
  /\bverifySessionCookie\s*\(/,
  /\bclerkClient\b/,
  /\bsupabase\s*(?:\?\.)?\.auth\s*\.\s*getUser\s*\(/,
  /\bauth\s*\.\s*getUser\s*\(/,
  /\bauth\s*\.\s*protect\s*\(/,
  /\bvalidateRequest\s*\(/,
  /\blucia\b/,
  /\bnextAuth\b/i,
  /\bpassport\s*\.\s*authenticate\s*\(/,
  /\bapiKey\s*(?:!==|===|==|!=)/,
  /\bverifyApiKey\s*\(/,
  /\bx-api-key\b/i,
  /\bauthorization\b/i,
  /\bbearer\b/i,
];

/** True when `text` contains evidence of an authentication or authorisation check. */
export function hasAuthSignal(text: string): boolean {
  return AUTH_SIGNAL_PATTERNS.some((p) => p.test(text));
}

/** The first auth-like construct found in `text`, for reporting purposes. */
export function findAuthSignal(text: string): string | null {
  for (const pattern of AUTH_SIGNAL_PATTERNS) {
    const m = pattern.exec(text);
    if (m !== null) return m[0];
  }
  return null;
}

/**
 * Patterns showing a request is rate-limited or otherwise throttled.
 */
const RATE_LIMIT_PATTERNS: readonly RegExp[] = [
  /\bratelimit\b/i,
  /\brate[_-]?limit/i,
  /\bthrottle/i,
  /\b@upstash\/ratelimit\b/,
  /\bRatelimit\b/,
  /\bexpress-rate-limit\b/,
  /\brateLimiter\b/,
  /\blimiter\s*\.\s*(?:consume|check|removeTokens)\s*\(/,
  /\bcheckQuota\b/i,
  /\bquota\b/i,
  /\bcredits?\b/i,
];

export function hasRateLimitSignal(text: string): boolean {
  return RATE_LIMIT_PATTERNS.some((p) => p.test(text));
}

/** Project-wide rate limiting dependencies. */
export function projectHasRateLimiter(index: ProjectIndex): boolean {
  return (
    index.hasDependency(
      'express-rate-limit',
      '@upstash/ratelimit',
      'rate-limiter-flexible',
      '@fastify/rate-limit',
      'limiter',
      'bottleneck',
      'p-throttle',
      '@arcjet/next',
      'hono-rate-limiter',
    ) || index.hasDependencyMatching('@arcjet/')
  );
}

/** Call expressions that send a prompt to a large language model. */
const LLM_CALL_PATTERNS: readonly RegExp[] = [
  /\bchat\s*\.\s*completions\s*\.\s*create\s*\(/,
  /\bcompletions\s*\.\s*create\s*\(/,
  /\bresponses\s*\.\s*create\s*\(/,
  /\bmessages\s*\.\s*(?:create|stream)\s*\(/,
  /\bgenerateText\s*\(/,
  /\bstreamText\s*\(/,
  /\bgenerateObject\s*\(/,
  /\bstreamObject\s*\(/,
  /\bgenerateContent\s*\(/,
  /\bembeddings\s*\.\s*create\s*\(/,
  /\binvoke\s*\(\s*\{?\s*(?:messages|input)/,
];

/** True when the text contains at least one LLM invocation. */
export function hasLlmCall(text: string): boolean {
  return LLM_CALL_PATTERNS.some((p) => p.test(text));
}

/** Offsets of every LLM invocation in a file. */
export function findLlmCalls(file: SourceFile): { index: number; text: string }[] {
  const out: { index: number; text: string }[] = [];
  for (const pattern of LLM_CALL_PATTERNS) {
    for (const match of file.matches(new RegExp(pattern.source, 'g'))) {
      out.push({ index: match.index, text: match.text });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Slice the argument object literal that follows a call site.
 *
 * @param file - File containing the call.
 * @param callOffset - Offset of the match that located the call.
 * @returns Source text of the first `{ ... }` argument, or null.
 */
export function callArgumentObject(file: SourceFile, callOffset: number): string | null {
  const code = file.code;
  const open = code.indexOf('(', callOffset);
  if (open === -1) return null;
  // Find the end of the call's argument list.
  let depth = 0;
  let end = -1;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  return file.content.slice(open + 1, end);
}

/** True when a file is exempt from production-code rules. */
export function isNonProductionFile(file: SourceFile): boolean {
  return (
    file.role === 'test' ||
    file.role === 'config' ||
    file.path.startsWith('scripts/') ||
    file.path.startsWith('tools/') ||
    file.path.startsWith('bench/') ||
    /(?:^|\/)(?:examples?|demos?|docs?|fixtures?|__mocks__|mocks)\//.test(file.path)
  );
}

/**
 * Environment variable names that are unsafe to expose to a browser bundle.
 */
const SECRET_ENV_NAME =
  /(?:SECRET|PRIVATE|_KEY|APIKEY|API_KEY|TOKEN|PASSWORD|PASSWD|CREDENTIAL|SERVICE_ROLE|CLIENT_SECRET|WEBHOOK_SECRET|ACCESS_KEY|SESSION|SALT|DSN|DATABASE_URL|CONNECTION_STRING)/i;

/**
 * Names that look secret but are conventionally public. Without this list the
 * public-env rule fires on every correctly-configured Supabase and Clerk app.
 */
const KNOWN_PUBLIC_ENV_SUFFIXES: readonly RegExp[] = [
  /ANON_KEY$/i,
  /PUBLISHABLE_KEY$/i,
  /PUBLIC_KEY$/i,
  /_PUBLIC$/i,
  /CLIENT_ID$/i,
  /^NEXT_PUBLIC_SUPABASE_URL$/i,
  /MEASUREMENT_ID$/i,
  /SENTRY_DSN$/i,
  /POSTHOG_KEY$/i,
  /STRIPE_PUBLISHABLE/i,
  /_APP_ID$/i,
  /_PROJECT_ID$/i,
  /_SENDER_ID$/i,
  /_BUCKET$/i,
  /_DOMAIN$/i,
  /_URL$/i,
];

/** True when an env var name implies a credential that must stay server-side. */
export function looksLikeSecretEnvName(name: string): boolean {
  if (KNOWN_PUBLIC_ENV_SUFFIXES.some((p) => p.test(name))) return false;
  return SECRET_ENV_NAME.test(name);
}

/** Strip the framework prefix from a browser-exposed env var name. */
export function stripPublicPrefix(name: string): string {
  return name.replace(
    /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|GATSBY_|NUXT_PUBLIC_|EXPO_PUBLIC_)/,
    '',
  );
}

/** Env var prefixes that inline a value into client-side JavaScript. */
export const PUBLIC_ENV_PREFIXES: readonly string[] = [
  'NEXT_PUBLIC_',
  'VITE_',
  'PUBLIC_',
  'REACT_APP_',
  'GATSBY_',
  'NUXT_PUBLIC_',
  'EXPO_PUBLIC_',
];

/**
 * True when a file can plausibly reach the browser: an explicit client
 * component, a page, a React module, or anything under a conventional client
 * directory.
 */
export function isClientReachable(file: SourceFile): boolean {
  if (file.isClientComponent) return true;
  if (file.role === 'next-app-route' || file.role === 'next-pages-api') return false;
  if (file.role === 'server-actions' || file.role === 'server-module') return false;
  if (file.role === 'next-pages-page' || file.role === 'react-module') return true;
  return /^(?:src\/)?(?:components|app|pages|features|views|widgets|client)\//.test(file.path);
}

/** Deduplicate findings that would point at the same location twice. */
export function dedupeByLocation<T extends { file: string; line: number }>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.file}:${item.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * True when the project looks like a deployable web application rather than a
 * library, a CLI or a set of scripts.
 *
 * Several observability rules ("you have no error monitoring", "you have no
 * health endpoint") are only meaningful for something that gets deployed and
 * serves traffic. Telling the author of a command-line tool to install Sentry
 * is noise, and noise is what makes people stop reading reports.
 */
export function isDeployableApp(index: ProjectIndex): boolean {
  if (index.routeFiles.length > 0) return true;
  if (index.withRole('server-module', 'server-actions', 'next-middleware').length > 0) return true;
  return index.hasFramework(
    'next',
    'express',
    'fastify',
    'hono',
    'nestjs',
    'remix',
    'astro',
    'sveltekit',
    'nuxt',
    'react',
    'vite',
  );
}

/** Cap how many findings a single rule reports, to keep reports readable. */
export const MAX_FINDINGS_PER_RULE = 25;
