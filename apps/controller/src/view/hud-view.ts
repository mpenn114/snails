import type { GameSnapshot } from '@snails/core';
import { windLabel } from './hud';
import type { TeamHealth } from './hud';
import { BTN_CLASS, SLOT_LEFT, SLOT_RIGHT } from '../shell/layers';

const SAFE = 'max(8px, env(safe-area-inset-top))';

/** DOM HUD callbacks. */
export interface HudCallbacks {
  onModeButton: () => void;
}

/**
 * Safe-area-aware DOM overlay above the canvas. The root ignores pointer events; only the mode
 * button and the minimap (inserted by the caller) accept them.
 */
export class HudView {
  readonly root: HTMLElement;
  private readonly wind: HTMLElement;
  private readonly bars: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly left: HTMLElement;

  constructor(doc: Document, cb: HudCallbacks) {
    const el = (css: string, tag = 'div'): HTMLElement => {
      const e = doc.createElement(tag);
      e.style.cssText = css;
      return e;
    };
    this.root = el(
      `position:absolute;inset:0;z-index:2;pointer-events:none;color:#fff;font:600 13px system-ui,sans-serif;` +
        `text-shadow:0 1px 2px rgba(0,0,0,.8);padding:${SAFE} max(8px, env(safe-area-inset-right)) ` +
        `max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))`,
    );
    this.left = el(
      `position:absolute;top:${SAFE};left:max(8px, env(safe-area-inset-left));display:flex;flex-direction:column;gap:6px`,
    );
    this.bars = el('display:flex;flex-direction:column;gap:3px;width:112px');
    this.wind = el('opacity:.85;font-size:12px');
    // Kill feed sits in the free centre column, below the single top bar.
    this.feed = el(
      `position:absolute;top:calc(${SAFE} + 60px);left:calc(max(8px, env(safe-area-inset-left)) + 120px);` +
        `right:calc(max(8px, env(safe-area-inset-right)) + 112px);text-align:center;font-size:12px`,
    );
    this.modeButton = el(
      `position:absolute;top:calc(${SAFE} + 60px);right:max(8px, env(safe-area-inset-right));pointer-events:auto`,
      'button',
    ) as HTMLButtonElement;
    this.modeButton.className = BTN_CLASS;
    this.modeButton.type = 'button';
    this.modeButton.addEventListener('click', cb.onModeButton);
    this.left.append(this.bars, this.wind);
    this.root.append(this.feed);
    // The shell's slots (above the view layer) host the columns; without them stay self-contained.
    const doc2 = this.root.ownerDocument;
    const leftSlot = doc2.getElementById(SLOT_LEFT);
    const rightSlot = doc2.getElementById(SLOT_RIGHT);
    if (leftSlot) {
      this.left.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      leftSlot.prepend(this.left);
    } else this.root.append(this.left);
    if (rightSlot) {
      this.modeButton.style.cssText = '';
      rightSlot.prepend(this.modeButton);
    } else this.root.append(this.modeButton);
    // Taps on the minimap and button must not start camera gestures on the container.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Puts the minimap at the top of the left column. */
  addMinimap(canvas: HTMLElement): void {
    this.left.insertBefore(canvas, this.bars);
  }

  /** Shows the camera mode on the toggle button. */
  setMode(mode: string): void {
    this.modeButton.textContent = `Camera: ${mode}`;
  }

  /** Redraws title, wind, health bars and feed. */
  update(snapshot: GameSnapshot, health: TeamHealth[], feed: string[]): void {
    this.wind.textContent = `Wind ${windLabel(snapshot.wind)}`;
    this.bars.replaceChildren(...health.map((h) => this.bar(h)));
    this.feed.replaceChildren(
      ...feed.map((t) => {
        const d = this.root.ownerDocument.createElement('div');
        d.textContent = t;
        return d;
      }),
    );
  }

  /** Removes the overlay. */
  dispose(): void {
    this.left.remove();
    this.modeButton.remove();
    this.root.remove();
  }

  private bar(h: TeamHealth): HTMLElement {
    const d = this.root.ownerDocument;
    const row = d.createElement('div');
    row.style.cssText = `background:rgba(0,0,0,.45);border-radius:4px;height:14px;position:relative;${h.active ? 'outline:2px solid #fff;' : ''}`;
    const fill = d.createElement('div');
    fill.style.cssText = `background:${h.colour};height:100%;border-radius:4px;width:${(h.fraction * 100).toFixed(1)}%`;
    const label = d.createElement('span');
    label.style.cssText = 'position:absolute;left:4px;top:-1px;font-size:11px';
    label.textContent = `${h.name} ${h.hp}`;
    row.append(fill, label);
    return row;
  }
}
