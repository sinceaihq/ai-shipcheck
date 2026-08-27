import { describe, expect, it } from 'vitest';
import { makeProject, removeProject, scanDirectory, firedRules } from '../helpers/project.js';

/**
 * Focused rule cases.
 *
 * The fixture suite proves each rule *can* fire. These cases pin the
 * boundaries: the shapes that must fire, and - more importantly - the
 * near-miss shapes that must not. Every false positive fixed in this project
 * gets a `does not fire` case here so it cannot come back.
 */

const NEXT_PKG = JSON.stringify({
  name: 'case',
  dependencies: { next: '^15.1.0', react: '^19.0.0' },
});

async function scanCase(files: Record<string, string>): Promise<Set<string>> {
  const dir = await makeProject({ 'package.json': NEXT_PKG, ...files });
  try {
    return firedRules(await scanDirectory(dir));
  } finally {
    await removeProject(dir);
  }
}

describe('security/hardcoded-secret', () => {
  it('detects a provider-formatted key assigned in source', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const key = "sk-ant-SHIPCHECKFIXTUREKEY000000000000";',
    });
    expect(fired).toContain('security/hardcoded-secret');
  });

  it('does not fire on values read from the environment', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const key = process.env.ANTHROPIC_API_KEY;',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not fire on placeholder values', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const apiKey = "your-api-key-goes-here-replace-me";',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not fire on a long non-credential string', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const message = "We could not process your payment, please try again.";',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not fire on a URL assigned to a key-shaped name', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const tokenEndpoint = "https://auth.example.com/oauth2/token";',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not fire on .env.example', async () => {
    const fired = await scanCase({
      '.env.example': 'ANTHROPIC_API_KEY=sk-ant-SHIPCHECKFIXTUREKEY000000000000',
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });
});

describe('security/public-env-secret', () => {
  it('fires on a secret behind a public prefix', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default function P() { return <p>{process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY}</p>; }',
    });
    expect(fired).toContain('security/public-env-secret');
  });

  it('does not fire on the Supabase anon key, which is public by design', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;',
    });
    expect(fired).not.toContain('security/public-env-secret');
  });

  it('does not fire on a publishable key', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;',
    });
    expect(fired).not.toContain('security/public-env-secret');
  });

  it('does not fire on a server-side variable', async () => {
    const fired = await scanCase({ 'lib/a.ts': 'export const k = process.env.STRIPE_SECRET_KEY;' });
    expect(fired).not.toContain('security/public-env-secret');
  });
});

describe('security/eval-usage', () => {
  it('does not fire on a property called eval', async () => {
    const fired = await scanCase({ 'lib/a.ts': 'const r = config.eval(1);' });
    expect(fired).not.toContain('security/eval-usage');
  });

  it('does not fire on eval mentioned in a comment', async () => {
    const fired = await scanCase({ 'lib/a.ts': '// never use eval(x) here\nexport const a = 1;' });
    expect(fired).not.toContain('security/eval-usage');
  });

  it('does not fire in test files', async () => {
    const fired = await scanCase({ 'tests/a.test.ts': 'it("x", () => { eval("1"); });' });
    expect(fired).not.toContain('security/eval-usage');
  });
});

describe('auth/unprotected-route-handler', () => {
  it('fires on an unauthenticated write', async () => {
    const fired = await scanCase({
      'app/api/notes/route.ts':
        'export async function POST(r: Request) { const b = await r.json(); await db.note.create({ data: b }); return Response.json({}); }',
    });
    expect(fired).toContain('auth/unprotected-route-handler');
  });

  it('does not fire when a session is resolved', async () => {
    const fired = await scanCase({
      'app/api/notes/route.ts':
        'import { getServerSession } from "next-auth";\nexport async function POST(r: Request) { const s = await getServerSession(); if (!s) return new Response(null, { status: 401 }); await db.note.create({ data: {} }); return Response.json({}); }',
    });
    expect(fired).not.toContain('auth/unprotected-route-handler');
  });

  it('does not fire on a read-only handler', async () => {
    const fired = await scanCase({
      'app/api/notes/route.ts':
        'export async function GET() { return Response.json(await db.note.findMany({ take: 10 })); }',
    });
    expect(fired).not.toContain('auth/unprotected-route-handler');
  });

  it('does not fire on a sign-in endpoint', async () => {
    const fired = await scanCase({
      'app/api/auth/login/route.ts':
        'export async function POST(r: Request) { const b = await r.json(); await db.session.create({ data: b }); return Response.json({}); }',
    });
    expect(fired).not.toContain('auth/unprotected-route-handler');
  });

  it('does not fire on a signature-verified webhook', async () => {
    const fired = await scanCase({
      'app/api/hooks/inbound/route.ts':
        'import { createHmac, timingSafeEqual } from "node:crypto";\nexport async function POST(r: Request) { const sig = r.headers.get("x-signature"); const body = await r.text(); const mac = createHmac("sha256", process.env.SECRET).update(body).digest(); if (!timingSafeEqual(Buffer.from(sig, "hex"), mac)) return new Response(null, { status: 400 }); await db.event.create({ data: {} }); return Response.json({}); }',
    });
    expect(fired).not.toContain('auth/unprotected-route-handler');
  });
});

describe('database/raw-sql-interpolation', () => {
  it('fires on an interpolated query string', async () => {
    const fired = await scanCase({
      'lib/q.ts': 'export const run = (id) => db.query(`SELECT * FROM users WHERE id = ${id}`);',
    });
    expect(fired).toContain('database/raw-sql-interpolation');
  });

  it('does not fire on a parameterising tagged template', async () => {
    const fired = await scanCase({
      'lib/q.ts':
        'export const run = (id) => prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;',
    });
    expect(fired).not.toContain('database/raw-sql-interpolation');
  });

  it('does not fire on a template with no interpolation', async () => {
    const fired = await scanCase({ 'lib/q.ts': 'export const q = `SELECT id FROM users`;' });
    expect(fired).not.toContain('database/raw-sql-interpolation');
  });
});

describe('database/supabase-missing-rls', () => {
  const supabasePkg = JSON.stringify({
    name: 'case',
    dependencies: { '@supabase/supabase-js': '^2.48.0' },
  });

  async function scanSql(files: Record<string, string>): Promise<Set<string>> {
    const dir = await makeProject({ 'package.json': supabasePkg, ...files });
    try {
      return firedRules(await scanDirectory(dir));
    } finally {
      await removeProject(dir);
    }
  }

  it('fires when a table has no RLS statement', async () => {
    const fired = await scanSql({
      'supabase/migrations/1.sql': 'create table public.notes (id uuid primary key);',
    });
    expect(fired).toContain('database/supabase-missing-rls');
  });

  it('does not fire when RLS is enabled in a later migration', async () => {
    const fired = await scanSql({
      'supabase/migrations/1.sql': 'create table public.notes (id uuid primary key);',
      'supabase/migrations/2.sql': 'alter table public.notes enable row level security;',
    });
    expect(fired).not.toContain('database/supabase-missing-rls');
  });

  it('does not accept a commented-out RLS statement', async () => {
    const fired = await scanSql({
      'supabase/migrations/1.sql':
        'create table public.notes (id uuid primary key);\n-- alter table public.notes enable row level security;',
    });
    expect(fired).toContain('database/supabase-missing-rls');
  });

  it('ignores platform-managed schemas', async () => {
    const fired = await scanSql({
      'supabase/migrations/1.sql': 'create table auth.sessions (id uuid primary key);',
    });
    expect(fired).not.toContain('database/supabase-missing-rls');
  });
});

describe('accessibility rules', () => {
  it('accepts an empty alt on a decorative image', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <img src="/x.png" alt="" />;',
    });
    expect(fired).not.toContain('accessibility/img-missing-alt');
  });

  it('accepts a fully keyboard-accessible div', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => <div role="button" tabIndex={0} onClick={go} onKeyDown={go}>Go</div>;',
    });
    expect(fired).not.toContain('accessibility/non-interactive-click-handler');
  });

  it('accepts an input labelled by htmlFor', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => (<><label htmlFor="e">Email</label><input id="e" type="email" /></>);',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('accepts an input labelled by aria-label', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default () => <input aria-label="Email address" type="email" />;',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('does not judge a control whose props are spread', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default (p) => <input {...p.register("email")} />;',
    });
    expect(fired).not.toContain('accessibility/form-control-missing-label');
  });

  it('does not fire on an arrow handler containing a greater-than sign', async () => {
    const fired = await scanCase({
      'app/page.tsx':
        'export default () => <img src="/a.png" alt="A" onLoad={() => setDone(true)} />;',
    });
    expect(fired).not.toContain('accessibility/img-missing-alt');
  });
});

describe('reliability/swallowed-error', () => {
  it('fires on an empty catch', async () => {
    const fired = await scanCase({ 'lib/a.ts': 'try { risky(); } catch (e) {}' });
    expect(fired).toContain('reliability/swallowed-error');
  });

  it('accepts a catch whose omission is explained in a comment', async () => {
    const fired = await scanCase({
      'lib/a.ts':
        'try { optionalCleanup(); } catch {\n  // best effort: the file may already be gone\n}',
    });
    expect(fired).not.toContain('reliability/swallowed-error');
  });

  it('accepts a catch that logs', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'try { risky(); } catch (e) { console.error(e); }',
    });
    expect(fired).not.toContain('reliability/swallowed-error');
  });
});

describe('reliability/missing-fetch-timeout', () => {
  it('accepts a fetch with an abort signal', async () => {
    const fired = await scanCase({
      'lib/a.ts': 'export const g = (u) => fetch(u, { signal: AbortSignal.timeout(5000) });',
    });
    expect(fired).not.toContain('reliability/missing-fetch-timeout');
  });
});

describe('performance/n-plus-one-query', () => {
  const prismaPkg = JSON.stringify({ name: 'case', dependencies: { '@prisma/client': '^6.1.0' } });

  it('does not fire on concurrent queries under Promise.all', async () => {
    const dir = await makeProject({
      'package.json': prismaPkg,
      'lib/a.ts':
        'export const load = (ids) => Promise.all(ids.map(async (id) => await prisma.note.findUnique({ where: { id } })));',
    });
    try {
      expect(firedRules(await scanDirectory(dir))).not.toContain('performance/n-plus-one-query');
    } finally {
      await removeProject(dir);
    }
  });
});

describe('security/permissive-cors', () => {
  it('escalates to critical when credentials are allowed', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'app/api/x/route.ts':
        'export async function GET() { const h = new Headers(); h.set("Access-Control-Allow-Origin", "*"); h.set("Access-Control-Allow-Credentials", "true"); return new Response(null, { headers: h }); }',
    });
    try {
      const result = await scanDirectory(dir);
      const finding = result.findings.find((f) => f.ruleId === 'security/permissive-cors');
      expect(finding?.severity).toBe('critical');
    } finally {
      await removeProject(dir);
    }
  });

  it('does not fire on an origin allowlist', async () => {
    const fired = await scanCase({
      'app/api/x/route.ts':
        'const allowed = ["https://app.example.com"];\nexport async function GET(r: Request) { const o = r.headers.get("origin"); const h = new Headers(); if (o && allowed.includes(o)) h.set("Access-Control-Allow-Origin", o); return new Response(null, { headers: h }); }',
    });
    expect(fired).not.toContain('security/permissive-cors');
  });
});

describe('scanning a tool that contains detection patterns', () => {
  // Found by running Shipcheck on itself: a file full of security patterns
  // looks alarming to a scanner that matches inside string literals. Each of
  // these is a real shape that appears in linters, docs and code generators.

  it('does not treat a regex alternation assigned to a secret-shaped name as a credential', async () => {
    const fired = await scanCase({
      'lib/patterns.ts':
        "export const SECRET_KEY_NAME = '(?:api[_-]?key|apikey|secret|token|password|client[_-]?secret)';",
    });
    expect(fired).not.toContain('security/hardcoded-secret');
  });

  it('does not fire on an environment variable name quoted as a label', async () => {
    const fired = await scanCase({
      'lib/messages.ts': "export const label = 'NODE_TLS_REJECT_UNAUTHORIZED=0';",
    });
    expect(fired).not.toContain('security/disabled-tls-verification');
  });

  it('still fires on a real NODE_TLS_REJECT_UNAUTHORIZED assignment', async () => {
    const fired = await scanCase({
      'lib/http.ts': "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';",
    });
    expect(fired).toContain('security/disabled-tls-verification');
  });

  it('does not fire on a quoted cors configuration example', async () => {
    const fired = await scanCase({
      'lib/docs.ts': "export const example = 'cors({ origin: true })';",
    });
    expect(fired).not.toContain('security/permissive-cors');
  });

  it('still fires on a real permissive cors call', async () => {
    const fired = await scanCase({
      'server/app.ts':
        "import express from 'express';\nconst app = express();\napp.use(cors({ origin: true }));",
    });
    expect(fired).toContain('security/permissive-cors');
  });

  it('does not treat a file that merely names express as a server module', async () => {
    const fired = await scanCase({
      'lib/hints.ts': 'export const SERVER_HINTS = ["from \'express\'", "from \'fastify\'"];',
    });
    expect(fired).not.toContain('observability/console-only-logging');
  });

  it('does not tell a library or CLI to install error monitoring', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({ name: 'a-cli', bin: { tool: 'dist/cli.js' } }),
      'src/cli.ts': 'export function main() { console.log("hello"); }',
    });
    try {
      const result = await scanDirectory(dir);
      expect(firedRules(result)).not.toContain('observability/no-error-monitoring');
      expect(
        result.checks.find((c) => c.ruleId === 'observability/no-error-monitoring')?.status,
      ).toBe('not-applicable');
    } finally {
      await removeProject(dir);
    }
  });

  it('does still tell a web application to install error monitoring', async () => {
    const fired = await scanCase({
      'app/page.tsx': 'export default function P() { return <p>hello</p>; }',
    });
    expect(fired).toContain('observability/no-error-monitoring');
  });

  it('does not report console logging from build scripts', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({ name: 'app', dependencies: { express: '^4.21.2' } }),
      'scripts/build.mjs': 'console.log("building");',
      'src/server.ts':
        "import express from 'express';\nconst app = express();\napp.get('/health', (_q, r) => r.json({ ok: true }));",
    });
    try {
      expect(firedRules(await scanDirectory(dir))).not.toContain(
        'observability/console-only-logging',
      );
    } finally {
      await removeProject(dir);
    }
  });
});

describe('configuration', () => {
  it('respects a disabled rule', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'lib/a.ts': 'export const r = eval("1+1");',
    });
    try {
      const result = await scanDirectory(dir, { rules: { 'security/eval-usage': 'off' } });
      expect(firedRules(result)).not.toContain('security/eval-usage');
      expect(result.checks.find((c) => c.ruleId === 'security/eval-usage')?.status).toBe(
        'disabled',
      );
    } finally {
      await removeProject(dir);
    }
  });

  it('respects a severity override', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'lib/a.ts': 'export const r = eval("1+1");',
    });
    try {
      const result = await scanDirectory(dir, {
        rules: { 'security/eval-usage': { severity: 'low' } },
      });
      expect(result.findings.find((f) => f.ruleId === 'security/eval-usage')?.severity).toBe('low');
    } finally {
      await removeProject(dir);
    }
  });

  it('respects an exclude pattern', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'legacy/a.ts': 'export const r = eval("1+1");',
    });
    try {
      const result = await scanDirectory(dir, { exclude: ['legacy/**'] });
      expect(firedRules(result)).not.toContain('security/eval-usage');
    } finally {
      await removeProject(dir);
    }
  });
});

describe('hostile input', () => {
  it('survives malformed and pathological source files', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'a.ts': 'const a = 1;'.repeat(2000),
      'b.tsx': 'export default () => <p>emoji and accents: \u{1F600} é</p>;',
      'c.ts': 'const unterminated = "',
      'd.ts': 'const t = `unterminated template ${',
      'e.ts': '/* unterminated block comment',
      'f.ts': '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> other',
      'g.ts': ' not-really-binary',
    });
    try {
      const result = await scanDirectory(dir);
      expect(result.verdict).toBeTruthy();
      expect(result.stats.filesScanned).toBeGreaterThan(0);
    } finally {
      await removeProject(dir);
    }
  });

  it('produces a coherent result for an empty directory', async () => {
    const dir = await makeProject({});
    try {
      const result = await scanDirectory(dir);
      expect(result.findings).toEqual([]);
      expect(result.verdict).toBe('NEEDS ATTENTION');
      expect(result.verdictReasons[0]).toContain('No production-readiness checks');
    } finally {
      await removeProject(dir);
    }
  });

  it('handles a project whose package.json is malformed', async () => {
    const dir = await makeProject({ 'package.json': '{ this is not json', 'a.ts': 'const a = 1;' });
    try {
      const result = await scanDirectory(dir);
      expect(result.stats.warnings.join(' ')).toContain('package.json');
      expect(result.profile.name).toBeNull();
    } finally {
      await removeProject(dir);
    }
  });

  it('handles directories with spaces and non-ASCII names', async () => {
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'src/weird dir name/a.ts': 'export const r = eval("1");',
      'src/\u00fcn\u00efc\u00f8d\u00e9 \u{1F680}/\u0444\u0430\u0439\u043b.ts':
        'export const r2 = eval("2");',
    });
    try {
      const result = await scanDirectory(dir);
      const files = result.findings.flatMap((f) => f.evidence.map((e) => e.file));
      expect(files.some((f) => f.includes('weird dir name'))).toBe(true);
      for (const file of files) {
        expect(file).not.toContain('\\');
        expect(file.startsWith('/')).toBe(false);
      }
    } finally {
      await removeProject(dir);
    }
  });

  it('escapes report-breaking characters rather than emitting them raw', async () => {
    // A filename or snippet is attacker-controlled when scanning an untrusted
    // repository. Neither may break out of a Markdown table, a SARIF string,
    // or a GitHub workflow command.
    const { getReporter } = await import('../../src/reporters/index.js');
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      'src/pipe|and`tick.ts': 'export const r = eval("1");',
      'src/newline-ish.ts': 'const evil = "]}\\n::error::injected"; export const r2 = eval(evil);',
    });
    try {
      const result = await scanDirectory(dir);
      const options = { color: false, quiet: false, root: dir };

      const markdown = getReporter('markdown')(result, options);
      for (const line of markdown.split('\n')) {
        if (!line.startsWith('| ')) continue;
        for (const cell of line.slice(2, -2).split(' | ')) expect(cell).not.toContain('|');
      }

      const sarif = JSON.parse(getReporter('sarif')(result, options)) as unknown;
      expect(sarif).toBeTruthy();
      expect(getReporter('json')(result, options)).toContain('"schemaVersion"');
    } finally {
      await removeProject(dir);
    }
  });

  it('scans a deeply nested path without stack overflow', async () => {
    const deep = 'a/'.repeat(15);
    const dir = await makeProject({
      'package.json': NEXT_PKG,
      [`${deep}file.ts`]: 'export const a = 1;',
    });
    try {
      const result = await scanDirectory(dir);
      expect(result.stats.filesScanned).toBeGreaterThanOrEqual(2);
    } finally {
      await removeProject(dir);
    }
  });
});
