import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth', () => ({ requireUser: async () => null }));

describe('app/api/notes/route', () => {
  it('rejects unauthenticated requests', async () => {
    const { GET } = await import('../app/api/notes/route');
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
