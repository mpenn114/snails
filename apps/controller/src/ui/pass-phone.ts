import type { ControlMode } from '@snails/protocol';

/**
 * Whether to show the "pass the phone" interstitial for a turn.
 * Only in hot-seat mode, on a phone that serves several teams and holds the incoming team.
 */
export function shouldPassPhone(
  mode: ControlMode,
  myTeamIds: readonly string[],
  turnTeamId: string,
): boolean {
  return mode === 'hotSeat' && myTeamIds.length > 1 && myTeamIds.includes(turnTeamId);
}

/** Interstitial label text. */
export function passPhoneText(teamName: string): string {
  return `Pass the phone to ${teamName}`;
}

/** Handle to the interstitial overlay. */
export interface PassPhone {
  /** Shows the overlay for `teamName`; `onContinue` fires once on tap. */
  show(teamName: string, onContinue?: () => void): void;
  hide(): void;
  destroy(): void;
}

/**
 * Mounts the full-screen "pass the phone to <team>" overlay (tap to continue).
 * @param root container element
 */
export function mountPassPhone(root: HTMLElement): PassPhone {
  const el = document.createElement('div');
  el.className = 'pass-phone';
  el.setAttribute('role', 'dialog');
  el.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(var(--snl-ink-rgb),.92);color:var(--snl-paper);font:800 var(--snl-text-xl) var(--snl-font);text-align:center;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';
  const label = document.createElement('button');
  label.type = 'button';
  label.style.cssText =
    'font:inherit;color:inherit;background:none;border:0;padding:2rem;min-height:44px;';
  el.appendChild(label);
  root.appendChild(el);
  let cont: (() => void) | undefined;
  // An inline `display:flex` would defeat the `hidden` attribute, so toggle `display` itself.
  const hide = (): void => {
    el.style.display = 'none';
  };
  label.addEventListener('click', () => {
    hide();
    const f = cont;
    cont = undefined;
    f?.();
  });
  return {
    show(teamName, onContinue) {
      label.textContent = `${passPhoneText(teamName)} (tap to continue)`;
      cont = onContinue;
      el.style.display = 'flex';
    },
    hide,
    destroy: () => el.remove(),
  };
}
