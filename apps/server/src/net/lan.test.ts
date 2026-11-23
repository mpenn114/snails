import { describe, expect, it } from 'vitest';
import { detectLanIPv4, findLanIPv4, joinUrl, primaryLanIp, rankLanIPv4 } from './lan.js';
import type { LanInterfaces } from './lan.js';

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal });

describe('rankLanIPv4', () => {
  it('ranks 192.168 before 10.x before 172.16-31.x', () => {
    const ifaces: LanInterfaces = {
      eth0: [v4('172.20.1.5'), v4('10.0.0.7')],
      wlan0: [v4('192.168.1.20')],
    };
    expect(rankLanIPv4(ifaces)).toEqual(['192.168.1.20', '10.0.0.7', '172.20.1.5']);
  });

  it('skips loopback, internal, link-local and IPv6 entries', () => {
    const ifaces: LanInterfaces = {
      lo: [v4('127.0.0.1', true)],
      eth0: [
        { address: '169.254.10.2', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
        v4('192.168.0.9', true),
        v4('10.1.1.1'),
      ],
    };
    expect(rankLanIPv4(ifaces)).toEqual(['10.1.1.1']);
  });

  it('drops virtual adapters by name', () => {
    const names = [
      'docker0',
      'veth1a2',
      'br-9f',
      'vmnet8',
      'vboxnet0',
      'virbr0',
      'utun3',
      'tailscale0',
      'zt7abc',
      'vEthernet (WSL)',
      'WSL',
      'Hyper-V vEthernet (Default)',
    ];
    const ifaces: LanInterfaces = Object.fromEntries(
      names.map((n, i) => [n, [v4(`192.168.${i}.2`)]]),
    );
    ifaces['eth0'] = [v4('10.9.9.9')];
    expect(rankLanIPv4(ifaces)).toEqual(['10.9.9.9']);
  });

  it('removes duplicates and accepts numeric family 4', () => {
    const ifaces: LanInterfaces = {
      en0: [v4('192.168.1.2'), { address: '192.168.1.2', family: 4, internal: false }],
      en1: [v4('192.168.1.2')],
    };
    expect(rankLanIPv4(ifaces)).toEqual(['192.168.1.2']);
  });

  it('ignores malformed addresses and returns [] when nothing usable', () => {
    expect(rankLanIPv4({ eth0: [v4('999.1.1.1'), v4('1.2.3')] })).toEqual([]);
    expect(rankLanIPv4({})).toEqual([]);
  });

  it('ranks public-looking addresses last', () => {
    expect(rankLanIPv4({ a: [v4('8.8.8.8')], b: [v4('172.16.0.4')] })).toEqual([
      '172.16.0.4',
      '8.8.8.8',
    ]);
  });
});

describe('primaryLanIp and detection', () => {
  it('uses the override when given, else the first candidate, else loopback', () => {
    expect(primaryLanIp(['192.168.1.2'], '  mybox.local ')).toBe('mybox.local');
    expect(primaryLanIp(['192.168.1.2'], '')).toBe('192.168.1.2');
    expect(primaryLanIp([])).toBe('127.0.0.1');
  });

  it('detectLanIPv4 uses injected interfaces', () => {
    expect(detectLanIPv4({ eth0: [v4('10.0.0.3')] })).toEqual(['10.0.0.3']);
  });

  it('findLanIPv4 returns an IPv4 string', () => {
    expect(findLanIPv4()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('builds join URLs', () => {
    expect(joinUrl('1.2.3.4', 3000, 'ABCD')).toBe('http://1.2.3.4:3000/?room=ABCD');
  });
});
