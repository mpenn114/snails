import { describe, expect, it } from 'vitest';
import type { LobbyPlayer } from '@snails/protocol';
import { addCpuMessage, cpuLabel, cpuSummary, removeCpuMessage } from './cpu-controls';
import { rosterHtml } from './lobby-html';

const cpu: LobbyPlayer = {
  id: 'cpu-1',
  name: 'CPU Rookie',
  role: 'controller',
  teamId: 'cpu-1',
  teamIds: ['cpu-1'],
  colour: '#00aa00',
  ready: true,
  connected: true,
  cpu: { difficulty: 'rookie', personality: 'aggressive' },
};

describe('cpu controls', () => {
  it('builds add/remove messages for the host only', () => {
    expect(addCpuMessage(true, 'regular', 'opportunist')).toEqual({
      type: 'addCpu',
      difficulty: 'regular',
      personality: 'opportunist',
    });
    expect(addCpuMessage(false, 'regular', 'opportunist')).toBeUndefined();
    expect(removeCpuMessage(true, 'cpu-1')).toEqual({ type: 'removeCpu', teamId: 'cpu-1' });
    expect(removeCpuMessage(false, 'cpu-1')).toBeUndefined();
  });

  it('labels options', () => {
    expect(cpuLabel('mastermind')).toBe('Mastermind');
    expect(cpuSummary({ difficulty: 'veteran', personality: 'cautious' })).toBe(
      'Veteran, Cautious',
    );
  });

  it('renders a CPU row with badge and host-only remove button', () => {
    const host = rosterHtml([cpu], 'h', true);
    expect(host).toContain('>CPU</span>');
    expect(host).toContain('Rookie, Aggressive');
    expect(host).toContain('class="cpu-remove" data-team="cpu-1"');
    expect(rosterHtml([cpu], 'h', false)).not.toContain('cpu-remove');
  });
});
