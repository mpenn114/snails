import { describe, expect, it } from 'vitest';
import { buildHelpContent, firewallHint, shouldAutoOpen } from './help-content';
import type { InfoLike } from './lobby-logic';

const info = (o: Partial<InfoLike> = {}): InfoLike => ({
  joinUrl: 'http://192.168.1.2:3000/',
  primaryIp: '192.168.1.2',
  port: 3000,
  lanFound: true,
  platform: 'win32',
  lanIps: ['192.168.1.2', '10.0.0.5'],
  ...o,
});

describe('help content', () => {
  it('shows platform firewall hints', () => {
    expect(firewallHint('win32')?.body).toContain('Private');
    expect(firewallHint('darwin')?.body).toContain('incoming');
    expect(firewallHint('linux')).toBeUndefined();
  });
  it('lists alternates and no-LAN warning', () => {
    const c = buildHelpContent(info());
    expect(c.alternates).toEqual(['10.0.0.5']);
    expect(c.noLan).toBe(false);
    expect(c.hints.map((h) => h.title)).toContain('Windows Firewall');
    const n = buildHelpContent(info({ lanFound: false, primaryIp: '127.0.0.1', lanIps: [] }));
    expect(n.noLan).toBe(true);
    expect(n.hints.map((h) => h.title)).toContain('No network address found');
    expect(buildHelpContent(undefined).noLan).toBe(true);
  });
  it('auto-opens only on first run outside automation', () => {
    expect(shouldAutoOpen(false, false)).toBe(true);
    expect(shouldAutoOpen(true, false)).toBe(false);
    expect(shouldAutoOpen(false, true)).toBe(false);
  });
});
