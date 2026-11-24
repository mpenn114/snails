import { describe, expect, it } from 'vitest';
import { BANNER_BACKLOG, BANNER_MS, BannerQueue, bannerHtml, bannerText } from './research-banner';

const b = (n: number) => ({ text: `b${n}`, colour: '#fff' });

describe('BannerQueue', () => {
  it('shows banners one at a time in order', () => {
    const q = new BannerQueue();
    q.push(b(1));
    q.push(b(2));
    expect(q.showing?.text).toBe('b1');
    expect(q.advance(BANNER_MS - 1)?.text).toBe('b1');
    expect(q.advance(2)?.text).toBe('b2');
    expect(q.advance(BANNER_MS)).toBeNull();
  });
  it('drops the oldest waiting banners beyond the backlog', () => {
    const q = new BannerQueue();
    for (let i = 0; i < BANNER_BACKLOG + 3; i++) q.push(b(i));
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const c = q.showing;
      if (c) seen.push(c.text);
      q.advance(BANNER_MS);
    }
    expect(seen).toHaveLength(BANNER_BACKLOG + 1);
    expect(seen[0]).toBe('b0');
    expect(seen.at(-1)).toBe(`b${BANNER_BACKLOG + 2}`);
  });
  it('formats and escapes', () => {
    expect(bannerText('Red', 'Iron Plating')).toBe('Red researched Iron Plating');
    expect(bannerHtml({ text: '<b>', colour: 'red;x' })).toContain('&lt;b&gt;');
    expect(bannerHtml({ text: 'x', colour: 'red;x' })).toContain('#888');
  });
});
