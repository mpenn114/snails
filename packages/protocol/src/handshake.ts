import { ClientHello } from './client.js';
import { PROTOCOL_VERSION } from './version.js';

/** Result of {@link checkHello}. */
export type HelloCheck =
  | { ok: true; hello: ClientHello }
  | { ok: false; error: 'bad_message' }
  | { ok: false; error: 'protocol_mismatch'; expected: number; got: number };

/**
 * Validates a raw hello and compares its protocol version with {@link PROTOCOL_VERSION}.
 * A well-formed hello with a different version yields `protocol_mismatch` (reportable)
 * rather than a parse failure.
 */
export function checkHello(raw: unknown): HelloCheck {
  const parsed = ClientHello.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'bad_message' };
  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: 'protocol_mismatch',
      expected: PROTOCOL_VERSION,
      got: parsed.data.protocolVersion,
    };
  }
  return { ok: true, hello: parsed.data };
}
