import type { ControllerClient } from '../net/client';
import type { InventoryView } from './weapon-list';

/** Latest per-team inventory received from the server. */
export interface InventoryTracker {
  /** The inventory of a team, or null before the first `inventory` message / for no team. */
  of(teamId: string | null): InventoryView | null;
  /** Subscribes to updates; returns an unsubscribe. */
  onChange(fn: () => void): () => void;
  dispose(): void;
}

/** Tracks the server's `inventory` messages (sent at match start and on every change). */
export function trackInventory(client: ControllerClient): InventoryTracker {
  const teams = new Map<string, InventoryView>();
  const listeners = new Set<() => void>();
  const off = client.on('inventory', (m) => {
    teams.clear();
    for (const t of m.teams) teams.set(t.teamId, { stock: t.stock, locked: t.locked });
    listeners.forEach((fn) => fn());
  });
  return {
    of: (teamId) => (teamId ? (teams.get(teamId) ?? null) : null),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      off();
      listeners.clear();
    },
  };
}
