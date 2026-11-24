/** How long one reveal banner stays up, in milliseconds. */
export const BANNER_MS = 3200;
/** Most banners waiting behind the current one; the oldest waiting ones are dropped beyond it. */
export const BANNER_BACKLOG = 4;

/** One reveal banner. */
export interface Banner {
  text: string;
  /** Team colour (CSS), for the accent. */
  colour: string;
}

/** Banner text for a completed tech. */
export function bannerText(teamName: string, techName: string): string {
  return `${teamName} researched ${techName}`;
}

/**
 * FIFO of reveal banners shown one at a time. Pure and time-driven (`advance`), so simultaneous
 * completions play in order instead of overlapping; a burst of more than the backlog drops the
 * oldest waiting ones.
 */
export class BannerQueue {
  private current: Banner | null = null;
  private left = 0;
  private readonly waiting: Banner[] = [];

  /** Queues a banner (shown at once when idle). */
  push(b: Banner): void {
    if (!this.current) {
      this.current = b;
      this.left = BANNER_MS;
      return;
    }
    this.waiting.push(b);
    while (this.waiting.length > BANNER_BACKLOG) this.waiting.shift();
  }

  /** Advances time; returns the banner now showing (or null). */
  advance(dtMs: number): Banner | null {
    if (!this.current) return null;
    this.left -= dtMs;
    if (this.left > 0) return this.current;
    const next = this.waiting.shift() ?? null;
    this.current = next;
    this.left = next ? BANNER_MS : 0;
    return next;
  }

  /** The banner showing right now. */
  get showing(): Banner | null {
    return this.current;
  }

  /** Drops everything (match over). */
  clear(): void {
    this.current = null;
    this.waiting.length = 0;
    this.left = 0;
  }
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** HTML of one banner (colour is validated, text escaped). */
export function bannerHtml(b: Banner): string {
  const colour = /^#[0-9a-f]{3,8}$/i.test(b.colour) ? b.colour : '#888';
  return `<div class="research-banner" style="border-color:${colour}">${esc(b.text)}</div>`;
}

/** Mounts the banner overlay; returns `show` (queue a banner) and `clear`. */
export function mountBanner(root: HTMLElement): {
  show: (b: Banner) => void;
  clear: () => void;
} {
  const el = document.createElement('div');
  el.className = 'research-banner-slot';
  root.appendChild(el);
  const queue = new BannerQueue();
  let shown: Banner | null = null;
  const render = (b: Banner | null): void => {
    if (b === shown) return;
    shown = b;
    el.innerHTML = b ? bannerHtml(b) : '';
  };
  setInterval(() => render(queue.advance(100)), 100);
  return {
    show: (b) => {
      queue.push(b);
      render(queue.showing);
    },
    clear: () => {
      queue.clear();
      render(null);
    },
  };
}
