import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('src/routes/notes', () => {
  it('rejects unauthenticated requests to /notes', async () => {
    const response = await request(app).get('/notes');
    expect(response.status).toBe(401);
  });

  it('serves the health endpoint', async () => {
    const response = await request(app).get('/health');
    expect(response.body).toEqual({ status: 'ok' });
  });
});
