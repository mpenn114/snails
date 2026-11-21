import { PROTOCOL_VERSION, parseServerMessage } from '@snails/protocol';
import type { ClientMessage, ServerMessage } from '@snails/protocol';

/** WebSocket client joining a room as a "controller". Also receives snapshots and events. */
export class ControllerClient {
  /** Called for every valid server message (including snapshots and game events). */
  onMessage: (m: ServerMessage) => void = () => {};
  private ws: WebSocket | undefined;

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly roomCode: string,
  ) {}

  /** Opens the socket and sends the hello. */
  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener('open', () =>
      this.send({
        type: 'hello',
        role: 'controller',
        name: this.name,
        roomCode: this.roomCode,
        protocolVersion: PROTOCOL_VERSION,
      }),
    );
    ws.addEventListener('message', (e) => this.onMessage(parseServerMessage(JSON.parse(String(e.data)))));
  }

  /** Sends a client message if the socket is open. */
  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
