/** What the aim view needs to know about the local player's aiming. */
export interface AimState {
  /** It is the local player's turn (aim mode and its arc only exist then). */
  myTurn: boolean;
  /** The aim view is on: the Aim button was pressed or an aim drag started. */
  aimMode: boolean;
  /** Selected weapon id, or null before a selection. */
  weaponId: string | null;
  /** Local aim elevation (radians) and power (0..1), or null before the first drag this turn. */
  aim: { angle: number; power: number } | null;
}

/** Small observable shared by the controls (writer) and the 3D view (reader). */
export interface AimStore {
  /** Current state (do not mutate). */
  readonly state: Readonly<AimState>;
  /** Subscribes to changes; returns an unsubscribe function. */
  subscribe(fn: (state: Readonly<AimState>) => void): () => void;
  /** Whose turn it is; the end of the local turn also leaves aim mode and forgets the aim. */
  setMyTurn(myTurn: boolean): void;
  /** Turns the aim view on or off (ignored off my turn). */
  setAimMode(on: boolean): void;
  /** Sets the selected weapon. */
  setWeapon(weaponId: string | null): void;
  /** Sets the live local aim. */
  setAim(angle: number, power: number): void;
}

/** Creates an {@link AimStore}. */
export function createAimStore(): AimStore {
  let state: AimState = { myTurn: false, aimMode: false, weaponId: null, aim: null };
  const listeners = new Set<(s: Readonly<AimState>) => void>();
  const update = (patch: Partial<AimState>): void => {
    const next = { ...state, ...patch };
    const changed = (Object.keys(patch) as (keyof AimState)[]).some((k) => next[k] !== state[k]);
    if (!changed) return;
    state = next;
    for (const fn of [...listeners]) fn(state);
  };
  return {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setMyTurn(myTurn) {
      if (myTurn) update({ myTurn });
      else update({ myTurn, aimMode: false, aim: null });
    },
    setAimMode(on) {
      update({ aimMode: on && state.myTurn });
    },
    setWeapon(weaponId) {
      update({ weaponId });
    },
    setAim(angle, power) {
      update({ aim: { angle, power } });
    },
  };
}
