import { buildHelpContent, shouldAutoOpen } from './help-content';
import { buildJoinUrl, type InfoLike } from './lobby-logic';
import { encodeQr, qrToSvg } from './qr';

const FLAG = 'snails.display.helpSeen';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function readSeen(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    // storage unavailable; panel will simply show again next time
  }
}

function qr(url: string): string {
  try {
    return qrToSvg(encodeQr(url));
  } catch {
    return '';
  }
}

function panelHtml(info: InfoLike | undefined, room: string): string {
  const c = buildHelpContent(info);
  const url = info ? buildJoinUrl(info.joinUrl, room) : '';
  const alts = c.alternates
    .map((ip) => `<li>${esc(buildJoinUrl(`http://${ip}:${info?.port ?? 3000}/`, room))}</li>`)
    .join('');
  return `<h2>Getting connected</h2>
    ${url ? `<p class="url">${esc(url)}</p><div class="qr">${c.noLan ? '' : qr(url)}</div>` : ''}
    ${c.hints.map((h) => `<p><strong>${esc(h.title)}:</strong> ${esc(h.body)}</p>`).join('')}
    ${alts ? `<p>Other addresses to try:</p><ul>${alts}</ul>` : ''}
    <button class="help-close">Got it</button>`;
}

/**
 * Mounts the "Getting connected" panel and its "Help connecting" button.
 * The panel auto-opens on first run (not under browser automation).
 * @param root element to append into
 */
export function mountHelpPanel(root: HTMLElement): {
  update: (info: InfoLike | undefined, roomCode: string) => void;
  hide: () => void;
} {
  const btn = document.createElement('button');
  btn.className = 'help-btn';
  btn.textContent = 'Help connecting';
  btn.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'help-panel';
  panel.hidden = true;
  root.append(btn, panel);
  let latest: { info: InfoLike | undefined; room: string } | undefined;
  let decided = false;

  const open = (): void => {
    if (!latest) return;
    panel.innerHTML = panelHtml(latest.info, latest.room);
    panel.hidden = false;
    panel.querySelector('.help-close')?.addEventListener('click', () => {
      panel.hidden = true;
      writeSeen();
    });
  };
  btn.addEventListener('click', open);
  return {
    update: (info, room) => {
      latest = { info, room };
      btn.hidden = false;
      if (!decided) {
        decided = true;
        if (shouldAutoOpen(readSeen(), navigator.webdriver === true)) open();
      }
    },
    hide: () => {
      btn.hidden = true;
      panel.hidden = true;
    },
  };
}
