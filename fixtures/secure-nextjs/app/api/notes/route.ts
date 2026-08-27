import { logger } from '../../../lib/logger';
import { requireUser } from '../../../lib/auth';
import { listNotes, prisma } from '../../../lib/db';

export async function GET() {
  const user = await requireUser();
  if (user === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const notes = await listNotes(user.id);
  return Response.json(notes);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as { title?: unknown };
  if (typeof body.title !== 'string' || body.title.length === 0) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const note = await prisma.note.create({ data: { title: body.title, userId: user.id } });
    return Response.json(note, { status: 201 });
  } catch (error) {
    logger.error({ err: error, userId: user.id }, 'failed to create note');
    return Response.json({ error: 'could not create note' }, { status: 500 });
  }
}
