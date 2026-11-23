/** Subset of the Battery Status API used here. */
export interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', fn: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', fn: () => void): void;
}

/** Navigator subset with the (non-standard, Chromium-only) battery accessor. */
export interface BatteryNavigator {
  getBattery?: () => Promise<BatteryLike>;
}

/** Charge fraction below which the saver switches on automatically. */
export const LOW_BATTERY_LEVEL = 0.2;

/** True when the battery is low and not charging. */
export function isLowBattery(level: number, charging: boolean): boolean {
  return !charging && level < LOW_BATTERY_LEVEL;
}

/**
 * Battery saver state: a manual choice (when the player toggled it) wins over the automatic
 * low-battery signal.
 */
export class BatterySaverState {
  private manual: boolean | null = null;
  private auto = false;

  constructor(private readonly onChange: (active: boolean) => void) {}

  /** Whether the saver is currently active. */
  get active(): boolean {
    return this.manual ?? this.auto;
  }

  /** Player toggle: sets an explicit choice. */
  setManual(on: boolean): void {
    this.apply(() => (this.manual = on));
  }

  /** Automatic signal from the battery monitor. A new low-battery event clears a manual "off". */
  setAuto(on: boolean): void {
    this.apply(() => {
      if (on && !this.auto && this.manual === false) this.manual = null;
      this.auto = on;
    });
  }

  private apply(mutate: () => void): void {
    const before = this.active;
    mutate();
    if (this.active !== before) this.onChange(this.active);
  }
}

/**
 * Watches the battery via an injectable navigator and reports whether it is low and discharging.
 * Resolves to a stop function; a no-op when the API is unavailable.
 */
export async function watchBattery(
  nav: BatteryNavigator,
  onLow: (low: boolean) => void,
): Promise<() => void> {
  if (typeof nav.getBattery !== 'function') return () => undefined;
  let battery: BatteryLike;
  try {
    battery = await nav.getBattery();
  } catch {
    return () => undefined;
  }
  const update = (): void => onLow(isLowBattery(battery.level, battery.charging));
  battery.addEventListener('levelchange', update);
  battery.addEventListener('chargingchange', update);
  update();
  return () => {
    battery.removeEventListener('levelchange', update);
    battery.removeEventListener('chargingchange', update);
  };
}
