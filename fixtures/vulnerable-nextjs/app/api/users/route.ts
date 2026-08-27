import { readFileSync } from 'node:fs';
import { prisma } from '../../../lib/db';

export async function POST(request: Request) {
  const body = await request.json();
  const template = readFileSync('./templates/welcome.txt', 'utf8');

  console.log('creating user', body.email, 'password', body.password);

  const created = await prisma.user.create({
    data: { email: body.email, name: body.name, welcome: template },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE users SET last_seen = now() WHERE email = '${body.email}'`,
  );

  try {
    await prisma.auditLog.create({ data: { action: 'user.create', userId: created.id } });
  } catch (error) {}

  return Response.json(created);
}

export async function DELETE() {
  await prisma.user.deleteMany();
  return new Response(null, { status: 204 });
}
