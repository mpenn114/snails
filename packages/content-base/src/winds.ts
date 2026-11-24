import type { WindDefinition } from '@snails/core';

/** Wind setting presets (strengths in m/s^2); Storm re-rolls wind while shots are in flight. */
export const winds: WindDefinition[] = [
  { id: 'base:off', name: 'Off', minStrength: 0, maxStrength: 0, changesMidFlight: false },
  { id: 'base:low', name: 'Low', minStrength: 0, maxStrength: 3, changesMidFlight: false },
  { id: 'base:normal', name: 'Normal', minStrength: 0, maxStrength: 7, changesMidFlight: false },
  { id: 'base:storm', name: 'Storm', minStrength: 5, maxStrength: 10, changesMidFlight: true },
];
