import { PROTOCOL_VERSION, parseServerMessage } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';

/** Same-origin WebSocket URL (`ws(s)://host/ws`) so the dev proxy and production both work. */
export function relativeWsUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

/** WebSocket client that joins a room as the "display" role. */
export class DisplayClient {
  /** Called for every valid server message. */
  onMessage: (m: ServerMessage) => void = () => {};

  constructor(
    private readonly url: string,
    private readonly roomCode?: string,
  ) {}

  /** Opens the socket and sends the hello. */
  connect(): void {
    const ws = new WebSocket(this.url);
    ws.addEventListener('open', () =>
      ws.send(
        JSON.stringify({
          type: 'hello',
          role: 'display',
          name: 'Display',
          ...(this.roomCode ? { roomCode: this.roomCode } : {}),
          protocolVersion: PROTOCOL_VERSION,
        }),
      ),
    );
    ws.addEventListener('message', (e) => {
      try {
        this.onMessage(parseServerMessage(JSON.parse(String(e.data))));
      } catch {
        // Ignore malformed or unknown messages.
      }
    });
  }
}
