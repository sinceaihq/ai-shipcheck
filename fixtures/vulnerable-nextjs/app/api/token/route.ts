import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  const body = await request.json();

  const claims = jwt.decode(body.token) as { sub?: string; role?: string };
  const isAdmin = claims.role === 'admin';
  const sessionToken = Math.random().toString(36).slice(2);
  const passwordHash = createHash('md5').update(body.password).digest('hex');

  const report = execSync('git log --author=' + body.author).toString();
  const scoring = new Function('input', 'return input.score * 2');

  if (body.shutdown === true) {
    process.exit(1);
  }

  return Response.json({
    claims,
    isAdmin,
    sessionToken,
    passwordHash,
    report,
    score: scoring(body),
    legacy: eval(body.expression),
  });
}
