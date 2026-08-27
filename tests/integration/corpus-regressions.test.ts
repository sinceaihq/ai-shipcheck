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
