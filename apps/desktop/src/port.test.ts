import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { pickFreePort } from './port.js';

let blocker: Server | undefined;
afterEach(() => void blocker?.close());

describe('pickFreePort', () => {
  it('returns the preferred port when free', async () => {
    const probe = await pickFreePort(0);
    expect(await pickFreePort(probe)).toBe(probe);
  });
  it('falls back to another port when the preferred one is taken', async () => {
    const srv = createServer();
    blocker = srv;
    await new Promise<void>((r) => srv.listen({ port: 0, host: '0.0.0.0' }, r));
    const taken = (srv.address() as AddressInfo).port;
    const got = await pickFreePort(taken);
    expect(got).not.toBe(taken);
    expect(got).toBeGreaterThan(0);
  });
});
