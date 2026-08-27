import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../lib/auth.js';
import { findNote, listNotes } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const idSchema = z.string().uuid();

export const notesRouter: Router = Router();

notesRouter.use(requireUser);

notesRouter.get('/', async (request, response) => {
  const userId = request.user?.id;
  if (userId === undefined) {
    response.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    response.json(await listNotes(userId));
  } catch (error) {
    logger.error({ err: error, userId }, 'failed to list notes');
    response.status(500).json({ error: 'could not list notes' });
  }
});

notesRouter.get('/:id', async (request, response) => {
  const userId = request.user?.id;
  const parsed = idSchema.safeParse(request.params.id);
  if (userId === undefined || !parsed.success) {
    response.status(400).json({ error: 'invalid request' });
    return;
  }

  const [note] = await findNote(parsed.data, userId);
  if (note === undefined) {
    response.status(404).json({ error: 'not found' });
    return;
  }

  response.json(note);
});
