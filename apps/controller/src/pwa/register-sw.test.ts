import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './register-sw';

describe('registerServiceWorker', () => {
  it('registers /sw.js by default and reports success', async () => {
    const register = vi.fn().mockResolvedValue({});
    const ok = await registerServiceWorker({ serviceWorker: { register } });
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('uses a custom script URL when given', async () => {
    const register = vi.fn().mockResolvedValue({});
    await registerServiceWorker({ serviceWorker: { register } }, '/custom/sw.js');
    expect(register).toHaveBeenCalledWith('/custom/sw.js');
  });

  it('no-ops when navigator is undefined', async () => {
    expect(await registerServiceWorker(undefined)).toBe(false);
  });

  it('no-ops when serviceWorker is unsupported', async () => {
    expect(await registerServiceWorker({})).toBe(false);
  });

  it('returns false instead of throwing when registration rejects', async () => {
    const register = vi.fn().mockRejectedValue(new Error('insecure context'));
    expect(await registerServiceWorker({ serviceWorker: { register } })).toBe(false);
  });
});
