import { describe, expect, it } from 'vitest';
import { buildServer } from './app.js';

describe('server', () => {
  it('serves /health', async () => {
    const app = await buildServer({ staticDir: '/nonexistent' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });
});
