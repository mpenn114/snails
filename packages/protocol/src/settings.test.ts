import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_SETTINGS, DEFAULT_TERRAIN_CONFIG } from '@snails/core';
import { MatchSettings, TerrainParams } from './common.js';
import { parseClientMessage } from './client.js';
import { decodeSnapshot, encodeSnapshot, type DecodedSnapshot } from './snapshot.js';
import { SimEventData } from './events.js';

describe('wire MatchSettings', () => {
  it('is core settings plus seed and control mode, defaulting to Classic', () => {
    expect(MatchSettings.parse({})).toEqual({
      ...DEFAULT_MATCH_SETTINGS,
      seed: 1,
      controlMode: 'perPlayer',
    });
  });

  it('carries the map size and larger terrain dimensions', () => {
    expect(MatchSettings.parse({}).mapSize).toBe('auto');
    expect(MatchSettings.parse({ mapSize: 'huge' }).mapSize).toBe('huge');
    expect(() => MatchSettings.parse({ mapSize: 'gigantic' })).toThrow();
    const t = { ...DEFAULT_TERRAIN_CONFIG, nx: 192, nz: 192 };
    expect(TerrainParams.parse(t)).toMatchObject({ nx: 192, nz: 192 });
  });

  it('accepts a legacy start message and fills the new fields', () => {
    const msg = parseClientMessage({
      type: 'startMatch',
      settings: { turnTimeSeconds: 20, snailsPerTeam: 2, seed: 9, controlMode: 'hotSeat' },
    });
    expect(msg).toMatchObject({
      settings: { turnTimeSeconds: 20, wind: 'normal', suddenDeathRound: 20 },
    });
  });

  it('parses setSettings and rejects out-of-range values', () => {
    expect(() =>
      parseClientMessage({ type: 'setSettings', settings: { wind: 'storm', crates: 'rare' } }),
    ).not.toThrow();
    expect(() =>
      parseClientMessage({ type: 'setSettings', settings: { startingHealth: 0 } }),
    ).toThrow();
  });
});

describe('sudden death on the wire', () => {
  it('carries the water level in snapshots (absent stays absent)', () => {
    const base: DecodedSnapshot = {
      tick: 1,
      wind: { strength: 0, direction: 0 },
      turn: {
        activeTeamId: null,
        activeSnailId: null,
        phase: 'intro',
        timeRemaining: 0,
        turnNumber: 1,
      },
      snails: [],
      projectiles: [],
      statuses: [],
      areas: [],
      scheduled: [],
      crates: [],
    };
    expect(decodeSnapshot(encodeSnapshot({ ...base, waterLevel: 5.25 })).waterLevel).toBe(5.25);
    expect(decodeSnapshot(encodeSnapshot(base)).waterLevel).toBeUndefined();
  });

  it('knows the sudden death events and damage cause', () => {
    expect(() =>
      SimEventData.parse({ type: 'suddenDeathStarted', round: 20, kind: 'both' }),
    ).not.toThrow();
    expect(() => SimEventData.parse({ type: 'waterRose', level: 5, delta: 0.5 })).not.toThrow();
    expect(() =>
      SimEventData.parse({
        type: 'snailDamaged',
        snailId: 'a',
        amount: 5,
        remaining: 10,
        sourceSnailId: null,
        cause: 'suddenDeath',
      }),
    ).not.toThrow();
  });
});
