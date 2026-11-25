import { describe, expect, it } from 'vitest';
import { resolveAssetDirs, resolveDisplayUrl, type PathInputs } from './paths.js';

const base: PathInputs = {
  isPackaged: false,
  resourcesPath: '/res',
  displayUrlEnv: undefined,
  devDisplayBuilt: false,
};
const srv = 'http://localhost:4000/display/?room=ABCD';

describe('resolveAssetDirs', () => {
  it('uses server defaults when unpackaged', () => {
    expect(resolveAssetDirs(base)).toEqual({});
  });
  it('points at extraResources when packaged', () => {
    const d = resolveAssetDirs({ ...base, isPackaged: true });
    expect(d.staticDir?.replaceAll('\\', '/')).toBe('/res/controller');
    expect(d.displayDir?.replaceAll('\\', '/')).toBe('/res/display');
  });
});

describe('resolveDisplayUrl', () => {
  it('prefers the env override', () => {
    const i = { ...base, isPackaged: true, displayUrlEnv: 'http://x:1' };
    expect(resolveDisplayUrl(i, srv, 'ABCD')).toBe('http://x:1/?room=ABCD');
  });
  it('uses the server display when packaged', () => {
    expect(resolveDisplayUrl({ ...base, isPackaged: true }, srv, 'ABCD')).toBe(srv);
  });
  it('uses the server display in dev when display/dist exists', () => {
    expect(resolveDisplayUrl({ ...base, devDisplayBuilt: true }, srv, 'ABCD')).toBe(srv);
  });
  it('falls back to Vite in dev without a build', () => {
    expect(resolveDisplayUrl(base, srv, 'ABCD')).toBe('http://localhost:5173/?room=ABCD');
  });
});
