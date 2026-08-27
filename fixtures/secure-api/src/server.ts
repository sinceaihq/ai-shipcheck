import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { logger } from './lib/logger.js';
import { notesRouter } from './routes/notes.js';

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

export const app = express();

app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin !== undefined && allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  next();
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/notes', notesRouter);

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info({ port }, 'api listening');
  });
}
