import { PROTOCOL_VERSION, parseServerMessage } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';

/** WebSocket client that joins a room as the "display" role. */
export class DisplayClient {
  /** Called for every valid server message. */
  onMessage: (m: ServerMessage) => void = () => {};

  constructor(
    private readonly url: string,
    private readonly roomCode: string,
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
          roomCode: this.roomCode,
          protocolVersion: PROTOCOL_VERSION,
        }),
      ),
    );
    ws.addEventListener('message', (e) =>
      this.onMessage(parseServerMessage(JSON.parse(String(e.data)))),
    );
  }
}
