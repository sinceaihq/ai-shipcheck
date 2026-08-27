/**
 * Shared analysis helpers for rules.
 *
 * Rules should reach for these rather than re-deriving structure. Two rules
 * that disagree about what "an authenticated route" means produce a confusing
 * report; centralising the definitions is what keeps the output coherent.
 */
import type { SourceFile } from '../analysis/source-file.js';
import type { ProjectIndex } from '../core/project-index.js';
import type { Evidence } from '../types/core.js';
import type { Applicability } from '../types/rule.js';

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
  // `chat.completions.create` is matched by the generic completions pattern
  // below, so it is not listed separately - overlapping alternatives would
  // report the same call site twice.
  /\bcompletions\s*\.\s*create\s*\(/,
  /\bresponses\s*\.\s*create\s*\(/,
  /\bmessages\s*\.\s*(?:create|stream)\s*\(/,
  /\bgenerateText\s*\(/,
  /\bstreamText\s*\(/,
  /\bgenerateObject\s*\(/,
  /\bstreamObject\s*\(/,
  /\bgenerateContent\s*\(/,
  /\bembeddings\s*\.\s*create\s*\(/,
  // `.invoke({ messages })` is deliberately absent. In LangChain it is the
  // generic runnable entry point - it covers chains, retrievers and agents,
  // where a token cap or a timeout is configured on the model object rather
  // than at the call site. Matching it reported hundreds of findings that had
  // no action attached to them.
];

/** True when the text contains at least one LLM invocation. */
export function hasLlmCall(text: string): boolean {
  return LLM_CALL_PATTERNS.some((p) => p.test(text));
}

/**
 * Offsets of every LLM invocation in a file, in source order.
 *
 * Overlapping matches are collapsed: a call that satisfies two patterns is one
 * call, and reporting it twice would both clutter the output and double-count
 * against the score.
 */
export function findLlmCalls(file: SourceFile): { index: number; text: string }[] {
  const byOffset = new Map<number, { index: number; text: string }>();
  for (const pattern of LLM_CALL_PATTERNS) {
    for (const match of file.matches(new RegExp(pattern.source, 'g'))) {
      const existing = byOffset.get(match.index);
      if (existing === undefined || match.text.length > existing.text.length) {
        byOffset.set(match.index, { index: match.index, text: match.text });
      }
    }
  }
  return [...byOffset.values()].sort((a, b) => a.index - b.index);
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

/**
 * Paths whose contents are not the deployed application.
 *
 * Examples, templates, benchmarks, generated bindings and end-to-end suites
 * are written to demonstrate or exercise something, not to run in production.
 * Judging them by production rules produces findings nobody will ever act on,
 * and a report full of those is a report people stop reading.
 *
 * Determined by path, never by project name - a rule that has to know which
 * repository it is looking at is a rule that does not work.
 */
const NON_PRODUCTION_PATH =
  /(?:^|\/)(?:examples?|demos?|samples?|playground|sandbox|starters?|templates?|boilerplate|scaffold|docs?|documentation|website|www|fixtures?|__fixtures__|__mocks__|mocks|stories|__stories__|bench|benchmarks?|perf|e2e|cypress|playwright|test|tests|__tests__|spec|specs)\//i;

/** Filenames that conventionally hold generated output. */
const GENERATED_FILE =
  /(?:\.gen|\.generated|_generated|-generated|\.pb|_pb|-bindings|\.bundle|\.min)\.[cm]?[jt]sx?$/i;

/** True when a file is exempt from production-code rules. */
export function isNonProductionFile(file: SourceFile): boolean {
  return (
    file.role === 'test' ||
    file.role === 'config' ||
    /^(?:scripts?|tools?|bin|build|config)\//.test(file.path) ||
    NON_PRODUCTION_PATH.test(file.path) ||
    GENERATED_FILE.test(file.path) ||
    /\.stories\.[cm]?[jt]sx?$/i.test(file.path)
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
  // Analytics, error-reporting, search and realtime vendors issue client-side
  // keys that are meant to be embedded in the page. Flagging them is a false
  // positive every time, and one that trains people to ignore the rule.
  /^(?:POSTHOG|MIXPANEL|AMPLITUDE|SEGMENT|GA|GTM|GOOGLE_ANALYTICS|HOTJAR|LOGROCKET|FULLSTORY|INTERCOM|CRISP|PLAUSIBLE|FATHOM|UMAMI|SENTRY|BUGSNAG|DATADOG|ALGOLIA|TYPESENSE|MEILISEARCH|MAPBOX|GOOGLE_MAPS|PUSHER|ABLY|STREAM|LIVEKIT|CLERK|FIREBASE|VAPID|TURNSTILE|RECAPTCHA|HCAPTCHA)[A-Z0-9_]*$/i,
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

/**
 * Build evidence for a project-level finding.
 *
 * Rules that reason about the project as a whole - "there is no error
 * monitoring", "there is no health endpoint" - still have to cite something.
 * Pointing at a directory produces a SARIF location no tool can open, and
 * inventing a snippet that is not in the file is worse: it looks like a quote
 * from the source and is not.
 *
 * This anchors such a finding to a real line of a real file, preferring the
 * first line that matches `anchor` and falling back to the file's first
 * non-empty line.
 *
 * @param index - Project index to look the file up in.
 * @param filePath - Repository-relative path of the file to cite.
 * @param options.anchor - Pattern identifying the most relevant line.
 * @param options.note - Short explanation attached to the evidence.
 */
export function projectEvidence(
  index: ProjectIndex,
  filePath: string,
  options: { anchor?: RegExp; note?: string } = {},
): Evidence {
  const file = index.file(filePath);
  if (file === undefined) {
    // The file is not in the index at all; cite it without a snippet rather
    // than fabricating one.
    return {
      file: filePath,
      line: 1,
      column: 1,
      snippet: '',
      ...(options.note === undefined ? {} : { note: options.note }),
    };
  }

  let offset = 0;
  if (options.anchor !== undefined) {
    const match = [...file.matchesText(new RegExp(options.anchor.source, 'g'))][0];
    if (match !== undefined) offset = match.index;
  }
  if (offset === 0) {
    // Skip leading blank lines so the snippet is never empty.
    const firstContent = /\S/.exec(file.content);
    offset = firstContent?.index ?? 0;
  }
  return file.evidenceAt(offset, options.note === undefined ? {} : { note: options.note });
}

/**
 * Applicability gate for the accessibility rules.
 *
 * Accessibility is about rendered UI. An HTTP API with no JSX has no controls,
 * no images and no focus order, so "accessibility: 100/100" would be a free
 * pass rather than a finding - and a free pass raises the overall score, which
 * is a weighted mean over assessed categories. Reporting the category as
 * not-applicable keeps the number honest.
 */
export function requiresRenderedUi(index: ProjectIndex): Applicability {
  const hasJsx = index.files.some((file) => file.isJsx && file.has(/<[A-Za-z][\w.-]*[\s/>]/g));
  if (!hasJsx) {
    return {
      applicable: false,
      status: 'not-applicable',
      reason: 'No JSX was found in this project, so there is no rendered UI to assess.',
    };
  }
  return { applicable: true };
}

/** Applicability gate for rules that only matter when a model SDK is present. */
export function requiresModelSdk(index: ProjectIndex): Applicability {
  if (!index.hasFramework('openai', 'anthropic', 'vercel-ai-sdk', 'langchain')) {
    return {
      applicable: false,
      status: 'not-applicable',
      reason: 'No language model SDK was detected in this project.',
    };
  }
  return { applicable: true };
}

/** Cap how many findings a single rule reports, to keep reports readable. */
export const MAX_FINDINGS_PER_RULE = 25;
