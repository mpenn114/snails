/** What to do on a `welcome` message. */
export type WelcomeAction = 'mount' | 'keep' | 'reset';

/** Decides, per session, whether a `welcome` needs a (re)mount. */
export interface SessionGate {
  /**
   * `mount` for the first welcome, `keep` for a repeat with the same player id (reconnect via
   * session token), `reset` when the player id changed (tear down, then mount again).
   */
  onWelcome(playerId: string): WelcomeAction;
}

/** Creates a gate remembering the player id of the currently mounted session. */
export function createSessionGate(): SessionGate {
  let current: string | null = null;
  return {
    onWelcome(playerId) {
      const action: WelcomeAction =
        current === null ? 'mount' : current === playerId ? 'keep' : 'reset';
      current = playerId;
      return action;
    },
  };
}
