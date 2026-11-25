import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { buildServer } from './app.js';
import { buildServerInfo } from './info.js';
import type { LanInterfaces } from './net/lan.js';

const ifaces = (): LanInterfaces => ({
  docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  eth0: [{ address: '10.0.0.8', family: 'IPv4', internal: false }],
  wlan0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
});

describe('buildServerInfo', () => {
  it('ranks LAN addresses and points the join URL at the best one', () => {
    const info = buildServerInfo({ port: 3000, networkInterfaces: ifaces });
    expect(info).toMatchObject({
      name: 'Snails',
      protocolVersion: PROTOCOL_VERSION,
      lanIps: ['192.168.1.20', '10.0.0.8'],
      primaryIp: '192.168.1.20',
      lanFound: true,
      platform: process.platform,
      port: 3000,
      joinUrl: 'http://192.168.1.20:3000/',
    });
    expect(typeof info.version).toBe('string');
  });

  it('honours a public host override', () => {
    const info = buildServerInfo({
      port: 8080,
      publicHost: 'snails.lan',
      networkInterfaces: ifaces,
    });
    expect(info.primaryIp).toBe('snails.lan');
    expect(info.joinUrl).toBe('http://snails.lan:8080/');
    expect(info.lanIps[0]).toBe('snails.lan');
  });

  it('falls back to loopback when no LAN address exists', () => {
    const info = buildServerInfo({ port: 3000, networkInterfaces: () => ({}) });
    expect(info.primaryIp).toBe('127.0.0.1');
    expect(info.lanIps).toEqual(['127.0.0.1']);
    expect(info.lanFound).toBe(false);
  });
});

describe('GET /api/info', () => {
  it('returns the info payload', async () => {
    const app = await buildServer({
      staticDir: '/nonexistent',
      displayDir: '/nonexistent',
      port: 4321,
      publicHost: '',
      networkInterfaces: ifaces,
    });
    const res = await app.inject({ method: 'GET', url: '/api/info' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'Snails',
      protocolVersion: PROTOCOL_VERSION,
      primaryIp: '192.168.1.20',
      port: 4321,
      joinUrl: 'http://192.168.1.20:4321/',
    });
    await app.close();
  });
});
