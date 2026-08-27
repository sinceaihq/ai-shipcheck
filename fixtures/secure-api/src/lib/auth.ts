import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string };
  }
}

export function requireUser(request: Request, response: Response, next: NextFunction) {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith('Bearer ')) {
    logger.info({ path: request.path }, 'rejected unauthenticated request');
    response.status(401).json({ error: 'unauthorized' });
    return;
  }

  request.user = { id: header.slice('Bearer '.length) };
  next();
}
