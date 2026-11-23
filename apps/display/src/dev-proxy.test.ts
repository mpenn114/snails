import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, buildDevProxy, serverUrlFromEnv, toWsOrigin } from './dev-proxy';

describe('toWsOrigin', () => {
  it('maps http to ws and https to wss', () => {
    expect(toWsOrigin('http://10.0.0.5:3000')).toBe('ws://10.0.0.5:3000');
    expect(toWsOrigin('https://game.local')).toBe('wss://game.local');
  });

  it('keeps ws origins and strips paths', () => {
    expect(toWsOrigin('ws://h:1/some/path')).toBe('ws://h:1');
  });

  it('rejects unsupported protocols', () => {
    expect(() => toWsOrigin('ftp://h')).toThrow(/http\(s\) or ws\(s\)/);
  });
});

describe('buildDevProxy', () => {
  it('defaults to the server default port', () => {
    const proxy = buildDevProxy();
    expect(DEFAULT_SERVER_URL).toBe('http://localhost:3000');
    expect(proxy['/api']).toEqual({ target: 'http://localhost:3000', changeOrigin: true });
    expect(proxy['/ws']).toEqual({ target: 'ws://localhost:3000', ws: true, changeOrigin: true });
  });

  it('forwards /api over http and /ws over websocket to a custom origin', () => {
    const proxy = buildDevProxy('http://192.168.1.20:4000/');
    expect(proxy['/api']?.target).toBe('http://192.168.1.20:4000');
    expect(proxy['/ws']?.target).toBe('ws://192.168.1.20:4000');
    expect(proxy['/ws']?.ws).toBe(true);
    expect(proxy['/api']?.ws).toBeUndefined();
  });

  it('throws for an invalid server URL', () => {
    expect(() => buildDevProxy('not a url')).toThrow();
  });
});

describe('serverUrlFromEnv', () => {
  it('uses SNAILS_SERVER when set', () => {
    expect(serverUrlFromEnv({ SNAILS_SERVER: ' http://box:3000 ' })).toBe('http://box:3000');
  });

  it('falls back to the default when unset or blank', () => {
    expect(serverUrlFromEnv({})).toBe(DEFAULT_SERVER_URL);
    expect(serverUrlFromEnv({ SNAILS_SERVER: '   ' })).toBe(DEFAULT_SERVER_URL);
  });
});
