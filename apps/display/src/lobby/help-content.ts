import type { InfoLike } from './lobby-logic';

/** One block of guidance in the "Getting connected" panel. */
export interface HelpHint {
  /** Short heading. */
  title: string;
  /** Body text. */
  body: string;
}

/** Everything the panel needs to render, derived purely from server info. */
export interface HelpContent {
  /** Hints in display order. */
  hints: HelpHint[];
  /** Alternate LAN addresses when several interfaces exist. */
  alternates: string[];
  /** True when no LAN address is available and the URL is loopback. */
  noLan: boolean;
}

/**
 * Chooses the firewall hint for a platform (`process.platform` value).
 * @param platform server platform string
 * @returns a hint, or undefined when none applies
 */
export function firewallHint(platform: string): HelpHint | undefined {
  if (platform === 'win32') {
    return {
      title: 'Windows Firewall',
      body: 'When Windows asks, allow Snails on Private networks. If you missed the prompt, open Windows Security > Firewall > Allow an app and tick Private for Snails.',
    };
  }
  if (platform === 'darwin') {
    return {
      title: 'macOS firewall',
      body: 'If macOS asks whether Snails may accept incoming network connections, choose Allow.',
    };
  }
  return undefined;
}

/**
 * Builds the guidance content from server info.
 * @param info `/api/info` data, or undefined when unreachable
 */
export function buildHelpContent(info: InfoLike | undefined): HelpContent {
  const noLan = !info || !info.lanFound || /^(127\.|localhost)/.test(info.primaryIp);
  const hints: HelpHint[] = [
    {
      title: 'Same Wi-Fi',
      body: 'Phones must be on the same Wi-Fi (or network) as this computer. Guest networks often block device-to-device traffic.',
    },
  ];
  const fw = firewallHint(info?.platform ?? '');
  if (fw) hints.push(fw);
  if (noLan) {
    hints.push({
      title: 'No network address found',
      body: 'This computer has no LAN address, so phones cannot join yet. Connect to Wi-Fi or Ethernet, then restart Snails.',
    });
  }
  const alternates = info && !noLan ? info.lanIps.filter((ip) => ip !== info.primaryIp) : [];
  return { hints, alternates, noLan };
}

/**
 * Decides whether to auto-open the panel.
 * @param seenBefore whether the first-run flag was already stored
 * @param automated true under browser automation (e.g. Playwright)
 */
export function shouldAutoOpen(seenBefore: boolean, automated: boolean): boolean {
  return !seenBefore && !automated;
}
