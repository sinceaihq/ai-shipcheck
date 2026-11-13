import { describe, expect, it } from 'vitest';
import { firedRules, makeProject, removeProject, scanDirectory } from '../helpers/project.js';

/**
 * Regressions found by scanning real repositories.
 *
 * Every case here is a minimal reproduction of something AI Shipcheck got
 * wrong on code written by people who had never heard of it. Fixtures written
 * alongside a rule agree with that rule by construction; these do not, which
 * is exactly what makes them worth keeping.
 *
 * See `corpus/TRIAGE.md` for the finding each one came from.
 */

const NEXT_PKG = JSON.stringify({
  name: 'case',
  dependencies: { next: '^15.1.0', react: '^19.0.0' },
});

async function scanCase(
  files: Record<string, string>,
  pkg: string = NEXT_PKG,
): Promise<Set<string>> {
  const dir = await makeProject({ 'package.json': pkg, ...files });
  try {
    return firedRules(await scanDirectory(dir));
  } finally {
    await removeProject(dir);
  }
}

describe('security/hardcoded-secret', () => {
  it('does not treat translated user-facing text as a credential', async () => {
    // Found in payloadcms/payload: Shannon entropy is measured per character,
    // and CJK or Thai prose scores higher than a real API key does. Combined
    // with a binding named for a password, this fired a *blocking* critical
    // finding on a localisation file.
    const fired = await scanCase({
      'lib/th.ts':
        "export const messages = {\n  usernameOrPasswordIncorrect: 'ชื่อผู้ใช้หรือรหัสผ่านที่คุณให้มาไม่ถูกต้อง',\n  youDidNotRequestPassword: '如果您没有要求这样做，请忽略这封邮件，您的密码将保持不变。',\n};",
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('still detects a real credential assigned to a secret-named binding', async () => {
    const fired = await scanCase({
      'lib/a.ts': "export const apiSecret = 'Zq7Rm4pLv9WxKd2NbTgH5sYcJf8AeUiO3RzQm4pL';",
    });
    expect(fired).toContain('security/hardcoded-secret');
  });

  // Nine of the thirteen blocking findings this rule produced across the
  // corpus were names, not credentials. Each literal sat on a binding whose
  // name mentions a credential ("token", "auth", "apiKey"), was at least 24
  // characters, and passed the entropy threshold - which ordinary multi-word
  // identifiers do, because per-character entropy of English is above it.
  it.each([
    [
      // documenso/documenso, packages/lib/errors/app-error.ts
      'an error code whose value is its own name',
      "export enum AppErrorCode {\n  CSC_CREDENTIAL_LIST_EMPTY = 'CSC_CREDENTIAL_LIST_EMPTY',\n}",
    ],
    [
      // langchain-ai/langchainjs, libs/langchain-core/src/utils/gateway.ts
      'the name of an environment variable',
      'const LANGSMITH_GATEWAY_API_KEY = "LANGSMITH_GATEWAY_API_KEY";\nexport const key = process.env[LANGSMITH_GATEWAY_API_KEY];',
    ],
    [
      // nextauthjs/next-auth, packages/adapter-pouchdb/src/index.ts
      'a database index name',
      'export function indexes(options: { indexes?: Record<string, string> }) {\n  const { verificationTokenByToken = "nextAuthVerificationRequestByToken" } = options.indexes ?? {};\n  return verificationTokenByToken;\n}',
    ],
    [
      // nextauthjs/next-auth, packages/adapter-unstorage/src/index.ts
      'a storage key prefix',
      'export const defaults = {\n  authenticatorUserKeyPrefix: "authenticator:by-user-id:",\n};',
    ],
    [
      // Mintplex-Labs/anything-llm, frontend/src/utils/constants.js
      'a localStorage key',
      'export const AUTH_TIMESTAMP = "anythingllm_authTimestamp";',
    ],
    [
      // Mintplex-Labs/anything-llm, frontend/src/locales/nl/common.js - a
      // blocking finding on a localisation file, in Dutch rather than Thai.
      'a translated form label',
      'export const nl = {\n  auth_type: "Confluence-authenticatietype",\n};',
    ],
    [
      // Mintplex-Labs/anything-llm,
      // server/endpoints/api/openai/compatibility-test-script.cjs
      'an instruction to fill a key in',
      'export const client = {\n  apiKey: "ENTER_ANYTHINGLLM_API_KEY_HERE",\n};',
    ],
  ])('does not treat %s as a credential', async (_what, source) => {
    const fired = await scanCase({ 'lib/a.ts': source });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not treat the placeholder text of a form field as a credential', async () => {
    // Found in Mintplex-Labs/anything-llm,
    // frontend/src/components/VectorDBSelection/ChromaDBOptions/index.jsx:
    // example text shown in an empty input, which happens to start `sk-`.
    const fired = await scanCase({
      'components/ChromaOptions.tsx':
        'export function ChromaOptions() {\n  return <input type="password" name="ChromaApiKey" placeholder="sk-myApiKeyToAccessMyChromaInstance" />;\n}',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it.each([
    [
      // No digits, but not built from words either: capitals sit next to each
      // other, which no naming convention produces.
      'a letters-only random token',
      "export const sessionSecret = 'kJHgfDSAqweRTYuiOPlmNBvcXZasDFgh';",
    ],
    [
      'a hexadecimal token',
      "export const webhookToken = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b';",
    ],
    [
      // Word-shaped, but digits make it more than a name.
      'a token with a readable prefix',
      "export const apiToken = 'live_Zq7Rm4pLv9WxKd2NbTgH5sYcJf8Ae';",
    ],
  ])('still detects %s on a secret-named binding', async (_what, source) => {
    const fired = await scanCase({ 'lib/a.ts': source });
    expect(fired).toContain('security/hardcoded-secret');
  });

  it('still reports a secret made of words in a committed environment file', async () => {
    // The right-hand side of an environment file is always a configured
    // value, never a name, so being built from words excuses nothing there.
    const fired = await scanCase({
      '.env': 'SESSION_SECRET=CorrectHorseBatteryStapleSigningKey\n',
    });
    expect(fired).toContain('security/hardcoded-secret');
  });

  it('still detects a key in another attribute of a field that has a placeholder', async () => {
    const fired = await scanCase({
      'components/KeyField.tsx':
        'export function KeyField() {\n  return <input placeholder="Your API key" defaultValue="sk-SHIPCHECKFIXTUREKEY0000000000000000" />;\n}',
    });
    expect(fired).toContain('security/hardcoded-secret');
  });
});

describe('security/unsafe-shell-exec', () => {
  async function reportedLines(files: Record<string, string>): Promise<number[]> {
    const dir = await makeProject({ 'package.json': NEXT_PKG, ...files });
    try {
      const result = await scanDirectory(dir);
      return result.findings
        .filter((finding) => finding.ruleId === 'security/unsafe-shell-exec')
        .map((finding) => finding.evidence[0]!.line);
    } finally {
      await removeProject(dir);
    }
  }

  it('does not blame a constant command for interpolation in the next statement', async () => {
    // Found in vitejs/vite, packages/vite/src/node/server/index.ts: the rule
    // read 300 characters past the opening parenthesis, so a fixed command was
    // reported - as a blocker - because the *following* call used a template
    // literal. The second call does interpolate and is still reported.
    const lines = await reportedLines({
      'lib/yarn.ts': [
        "import { execSync } from 'node:child_process';",
        'export function yarnCacheDir(cwd: string): string {',
        "  const enableGlobalCache = execSync('yarn config get enableGlobalCache', { cwd }).toString().trim() === 'true';",
        "  return execSync(`yarn config get ${enableGlobalCache ? 'globalFolder' : 'cacheFolder'}`, { cwd }).toString().trim();",
        '}',
      ].join('\n'),
    });
    expect(lines).toEqual([4]);
  });

  it('does not read a template literal in the callback as the command', async () => {
    // Found in langchain-ai/langchainjs, environment_tests/scripts/test-runner.ts:
    // the only interpolation near the call was the error message built after
    // the process had exited.
    const lines = await reportedLines({
      'lib/run.ts': [
        "import { exec } from 'node:child_process';",
        'export function run(command: string): void {',
        '  exec(command, (error) => {',
        '    if (error) console.error(`Command failed: ${command}`);',
        '  });',
        '}',
      ].join('\n'),
    });
    expect(lines).toEqual([]);
  });

  it('still reports interpolation and concatenation in the command itself', async () => {
    const lines = await reportedLines({
      'lib/git.ts': [
        "import { exec, execSync } from 'node:child_process';",
        'export function clone(url: string, dir: string, ref: string): void {',
        '  exec(`git clone ${url} ${dir}`, () => {});',
        "  execSync('git -C ' + dir + ' checkout ' + ref);",
        "  execSync('git -C ' + dir);",
        '}',
      ].join('\n'),
    });
    expect(lines).toEqual([3, 4, 5]);
  });
});

describe('database/hardcoded-connection-string', () => {
  it('does not report text describing the shape of a connection string', async () => {
    // Found in drizzle-team/drizzle-orm (drizzle-kit/src/cli/connections.ts,
    // an error message) and Mintplex-Labs/anything-llm (PGVectorOptions, the
    // placeholder of a form field). Both were blocking findings. A port that
    // is a word rather than a number cannot be dialled.
    const fired = await scanCase({
      'lib/connect.ts':
        "export function requireDatabase(name?: string): void {\n  if (!name) throw new Error('You should specify a database name in connection string (mysql://USER:PASSWORD@HOST:PORT/DATABASE)');\n}",
      'components/PgOptions.tsx':
        'export const PgOptions = () => <input name="conn" placeholder="postgresql://username:password@host:port/database" />;',
    });
    expect(fired).not.toContain('database/hardcoded-connection-string');
  });

  it.each([
    ['a numeric port', "'postgres://app:Hx9Kd2NbTgH5sYcJ@db.acme-corp.net:5432/app'"],
    ['no port', "'mongodb+srv://app:Hx9Kd2NbTgH5sYcJ@cluster0.acme-corp.net/app'"],
    // Only the port is supplied at runtime; the password is still in source.
    ['an interpolated port', '`postgres://app:Hx9Kd2NbTgH5sYcJ@db.acme-corp.net:${port}/app`'],
  ])('still reports a real password with %s', async (_what, literal) => {
    const fired = await scanCase({
      'lib/db.ts': `const port = 5432;\nexport const url = ${literal};\nexport { port };`,
    });
    expect(fired).toContain('database/hardcoded-connection-string');
  });
});

describe('database RLS rules', () => {
  const supabasePkg = JSON.stringify({
    name: 'case',
    dependencies: { '@supabase/supabase-js': '^2.48.0', '@prisma/client': '^6.1.0' },
  });

  it('does not demand row-level security of a Prisma migration', async () => {
    // Found in nextauthjs/next-auth: the repository ships a Supabase adapter,
    // so Supabase was detected, and every unrelated SQL migration in the
    // monorepo was reported as a missing-RLS blocker.
    const fired = await scanCase(
      { 'prisma/migrations/1/migration.sql': 'CREATE TABLE "Session" (id TEXT NOT NULL);' },
      supabasePkg,
    );
    expect(fired).not.toContain('database/supabase-missing-rls');
  });

  it('still demands row-level security of a Supabase migration', async () => {
    const fired = await scanCase(
      { 'supabase/migrations/1.sql': 'create table public.notes (id uuid primary key);' },
      supabasePkg,
    );
    expect(fired).toContain('database/supabase-missing-rls');
  });
});

describe('database/destructive-migration', () => {
  it('does not report dropping a constraint as data loss', async () => {
    // Found in documenso/documenso: Prisma emits ALTER TABLE ... DROP
    // CONSTRAINT in nearly every migration touching a relation. No row is lost.
    const fired = await scanCase({
      'supabase/migrations/1.sql':
        'ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_userId_fkey";\nDROP INDEX "User_profileURL_key";',
    });
    expect(fired).not.toContain('database/destructive-migration');
  });

  it('still reports dropping a column or a table', async () => {
    const fired = await scanCase({
      'supabase/migrations/1.sql':
        'ALTER TABLE "User" DROP COLUMN "nickname";\nDROP TABLE "Legacy";',
    });
    expect(fired).toContain('database/destructive-migration');
  });
});

describe('database/unbounded-mutation', () => {
  it('does not read ON UPDATE CASCADE as a full-table write', async () => {
    // Found in documenso/documenso: a referential action contains the word
    // `update` followed by an identifier, so every foreign key in every
    // migration was reported as an unfiltered write.
    const fired = await scanCase({
      'supabase/migrations/1.sql':
        'ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    });
    expect(fired).not.toContain('database/unbounded-mutation');
  });

  it('still reports a genuinely unfiltered statement', async () => {
    const fired = await scanCase({
      'supabase/migrations/1.sql': 'DELETE FROM audit_log;',
    });
    expect(fired).toContain('database/unbounded-mutation');
  });
});

describe('database/raw-sql-interpolation', () => {
  it('recognises a member-access tagged template as parameterised', async () => {
    // Found in dubinc/dub: `Prisma.sql` is the documented safe form, and the
    // rule was reporting it as injection because of a lookbehind on `.`.
    const fired = await scanCase({
      'lib/q.ts':
        'export const q = (id: string) => Prisma.sql`SELECT * FROM "User" WHERE id = ${id}`;',
    });
    expect(fired).not.toContain('database/raw-sql-interpolation');
  });

  it('recognises a generic tagged template as parameterised', async () => {
    // Found in drizzle-team/drizzle-orm: `sql<number>` is a tagged template
    // with a type argument.
    const fired = await scanCase({
      'lib/q.ts': 'export const c = (t: unknown) => sql<number>`select count(*) from ${t}`;',
    });
    expect(fired).not.toContain('database/raw-sql-interpolation');
  });

  it('still reports genuine interpolation into a query', async () => {
    const fired = await scanCase({
      'lib/q.ts':
        'export const run = (id: string) => db.query(`SELECT * FROM users WHERE id = ${id}`);',
    });
    expect(fired).toContain('database/raw-sql-interpolation');
  });
});

describe('performance/unbounded-query', () => {
  const prismaPkg = JSON.stringify({ name: 'case', dependencies: { '@prisma/client': '^6.1.0' } });

  it('treats a where clause as bounding the result set', async () => {
    // Found in dubinc/dub: `findMany({ where: { id: { in: ids } } })` is the
    // most common query shape there is, and it is a targeted lookup.
    const fired = await scanCase(
      {
        'lib/db.ts':
          'export const load = (ids: string[]) => prisma.user.findMany({ where: { id: { in: ids } } });',
      },
      prismaPkg,
    );
    expect(fired).not.toContain('performance/unbounded-query');
  });

  it('still reports a genuinely unbounded read', async () => {
    const fired = await scanCase(
      { 'lib/db.ts': 'export const all = () => prisma.user.findMany();' },
      prismaPkg,
    );
    expect(fired).toContain('performance/unbounded-query');
  });
});

describe('security/open-redirect', () => {
  it('does not report a redirect to a literal same-origin path', async () => {
    // Found in dubinc/dub: `NextResponse.redirect(new URL('/onboarding?next=…', req.url))`
    // navigates within the site. The query string mentioning `next` was what
    // triggered the old, far too loose, request-source pattern.
    const fired = await scanCase({
      'middleware.ts':
        'import { NextResponse } from "next/server";\nexport function middleware(req: Request) {\n  return NextResponse.redirect(new URL(`/onboarding?next=${encodeURIComponent("/x")}`, req.url));\n}',
    });
    expect(fired).not.toContain('security/open-redirect');
  });

  it('does not report a target passed through a validation helper', async () => {
    // Found in documenso/documenso: applications factor this out, and the rule
    // was reporting the codebases that had done exactly the right thing.
    const fired = await scanCase({
      'app/signin/page.tsx':
        'import { redirect } from "next/navigation";\nexport default function P({ searchParams }: any) {\n  let returnTo = searchParams.get("returnTo");\n  returnTo = isValidReturnTo(returnTo) ? normalizeReturnTo(returnTo) : undefined;\n  throw redirect(returnTo || "/");\n}',
    });
    expect(fired).not.toContain('security/open-redirect');
  });

  it('still reports an unvalidated request-derived redirect', async () => {
    const fired = await scanCase({
      'app/api/go/route.ts':
        'import { NextResponse } from "next/server";\nexport async function GET(request: Request) {\n  const redirectTo = new URL(request.url).searchParams.get("redirectTo");\n  return NextResponse.redirect(redirectTo!);\n}',
    });
    expect(fired).toContain('security/open-redirect');
  });
});

describe('security/dangerous-html', () => {
  it('does not report a constant HTML string', async () => {
    // Found in honojs/hono: there is no input to inject into a literal.
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => <div dangerouslySetInnerHTML={{ __html: \'<p class="x">3</p>\' }} />;',
    });
    expect(fired).not.toContain('security/dangerous-html');
  });

  it('still reports an interpolated value', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default ({ bio }: { bio: string }) => <div dangerouslySetInnerHTML={{ __html: bio }} />;',
    });
    expect(fired).toContain('security/dangerous-html');
  });
});

describe('security/disabled-tls-verification', () => {
  it('does not report an explicit user-facing insecure option', async () => {
    // Found in usebruno/bruno: an HTTP client offering --insecure, the way
    // curl does, is a deliberate affordance rather than a deployment blocker.
    const fired = await scanCase({
      'src/server.ts':
        'import https from "node:https";\nexport function agentFor(options: { insecure: boolean }) {\n  if (options.insecure) {\n    return new https.Agent({ rejectUnauthorized: false });\n  }\n  return undefined;\n}',
    });
    expect(fired).not.toContain('security/disabled-tls-verification');
  });

  it('still reports unconditional disabling', async () => {
    const fired = await scanCase({
      'src/server.ts':
        'import https from "node:https";\nexport const agent = new https.Agent({ rejectUnauthorized: false });',
    });
    expect(fired).toContain('security/disabled-tls-verification');
  });
});

describe('auth/jwt-verification-bypass', () => {
  it('does not report decoding a token to read its expiry', async () => {
    // Found in langchain-ai/langchainjs and payloadcms/payload: reading `exp`
    // from a token already obtained over TLS is ordinary and safe.
    const fired = await scanCase({
      'app/api/token/route.ts':
        'import { decodeJwt } from "jose";\nexport async function GET() {\n  const claims = decodeJwt(idToken);\n  return Response.json({ expires: claims.exp });\n}',
    });
    expect(fired).not.toContain('auth/jwt-verification-bypass');
  });

  it('still reports decoding a token and trusting its identity claims', async () => {
    const fired = await scanCase({
      'app/api/token/route.ts':
        'import jwt from "jsonwebtoken";\nexport async function POST(r: Request) {\n  const body = await r.json();\n  const claims = jwt.decode(body.token) as any;\n  const isAdmin = claims.role === "admin";\n  return Response.json({ isAdmin });\n}',
    });
    expect(fired).toContain('auth/jwt-verification-bypass');
  });
});

describe('security/public-env-secret', () => {
  it('does not report analytics keys that are public by design', async () => {
    // Found in usebruno/bruno: a PostHog project key is meant to be in the page.
    const fired = await scanCase({
      'app/page.tsx':
        'export default function P() {\n  const k = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;\n  return <p>{k}</p>;\n}',
    });
    expect(fired).not.toContain('security/public-env-secret');
  });

  it('still reports a genuinely secret value behind a public prefix', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default function P() {\n  const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;\n  return <p>{k}</p>;\n}',
    });
    expect(fired).toContain('security/public-env-secret');
  });
});

describe('accessibility/form-control-missing-label', () => {
  it('accepts a control wrapped in its label', async () => {
    // Found across the corpus: `<label>Email <input /></label>` associates the
    // two implicitly and is perfectly valid HTML.
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => (<label>Search notes<input type="search" name="q" /></label>);',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('accepts a control removed from the tab order', async () => {
    // Found in vercel/ai-chatbot: a visually hidden file input triggered by a
    // button elsewhere is not a control the user ever focuses.
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => <input type="file" tabIndex={-1} className="opacity-0" onChange={onPick} />;',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('accepts a hidden control', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <input type="file" hidden onChange={onPick} />;',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('still reports a genuinely unlabelled control', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <select name="plan"><option>a</option></select>;',
    });
    expect(fired).toContain('accessibility/form-control-missing-label');
  });
});

describe('performance/next-unoptimized-image', () => {
  it('accepts an image with explicit dimensions', async () => {
    // The measurable harm of a raw <img> is layout shift, which cannot happen
    // when the browser can reserve space. Reporting the rest made this a
    // style lint with 351 findings across the corpus.
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <img src="/a.png" alt="A" width={64} height={64} />;',
    });
    expect(fired).not.toContain('performance/next-unoptimized-image');
  });

  it('still reports an image the browser cannot reserve space for', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <img src="/hero.png" alt="Hero" />;',
    });
    expect(fired).toContain('performance/next-unoptimized-image');
  });
});

describe('reliability/unhandled-promise', () => {
  it('does not report a chain whose result is assigned and awaited', async () => {
    // Found in documenso/documenso: the statement scan stopped at the first
    // brace of an intervening object literal, losing the `const x =` in front.
    const fired = await scanCase({
      'lib/a.ts':
        'export async function f(payload: unknown) {\n  const value = createLink({ payload, options: { retry: true } }).then((r) => r.slug);\n  return await value;\n}',
    });
    expect(fired).not.toContain('reliability/unhandled-promise');
  });

  it('still reports a bare fire-and-forget chain', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export function f() {\n  track("event").then((r) => r.ok);\n}',
    });
    expect(fired).toContain('reliability/unhandled-promise');
  });
});

describe('reliability/swallowed-error', () => {
  it('accepts an empty catch paired with a finally block', async () => {
    const fired = await scanCase({
      'lib/a.ts':
        'export function f(handle: { close(): void }) {\n  try {\n    risky();\n  } catch {\n  } finally {\n    handle.close();\n  }\n}',
    });
    expect(fired).not.toContain('reliability/swallowed-error');
  });
});

describe('non-production paths', () => {
  it('does not judge examples, templates or benchmarks by production rules', async () => {
    // 21% of the corpus findings sat in paths like these. They are written to
    // demonstrate or measure something, not to be deployed.
    const broken = 'export const r = eval("1"); try { risky(); } catch (e) {}';
    const fired = await scanCase({
      'examples/demo.ts': broken,
      'templates/starter.ts': broken,
      'benchmarks/run.ts': broken,
      'playground/app.ts': broken,
      'e2e/spec.ts': broken,
      'docs/snippet.ts': broken,
    });
    expect(fired).not.toContain('security/eval-usage');
    expect(fired).not.toContain('reliability/swallowed-error');
  });

  it('does not report .env files committed as test inputs', async () => {
    // Found in vitejs/vite: env-loading tests commit .env files as fixtures.
    const fired = await scanCase({
      'packages/core/__tests__/env/.env': 'SOME_SECRET=Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz',
      'playground/env-nested/.env': 'OTHER_SECRET=Hx9Kd2NbTgH5sYcJf8AeUiO3RzQm4p',
    });
    expect(fired).not.toContain('security/committed-env-file');
  });

  it('still judges the application itself', async () => {
    const fired = await scanCase({ 'lib/a.ts': 'export const r = eval("1");' });
    expect(fired).toContain('security/eval-usage');
  });
});

describe('build configuration is still inspected', () => {
  it('reports disabled build checks even though config files are non-production', async () => {
    // The blanket non-production guard excludes files with the `config` role,
    // which is exactly what this rule needs to read.
    const fired = await scanCase({
      'next.config.js':
        'module.exports = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } };',
      'tsconfig.json': '{ "compilerOptions": { "strict": false } }',
    });
    expect(fired).toContain('reliability/debug-mode-in-production');
  });
});
