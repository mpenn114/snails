import { registerTechHook } from '@snails/core';

/**
 * Great Spiral: Arsenal, one-time part: when the team completes it, every finite weapon stock
 * it currently holds grows by 1 (the `stockBonus` stat covers later grants).
 */
registerTechHook('great-spiral-arsenal', (ctx, event, teamId) => {
  if (event.type !== 'researchCompleted' || event.teamId !== teamId) return;
  if (event.techId !== 'great-spiral-arsenal') return;
  const inv = ctx.state.teams.find((t) => t.id === teamId)?.inventory;
  if (!inv) return;
  for (const id of Object.keys(inv)) if ((inv[id] ?? 0) > 0) inv[id] = (inv[id] ?? 0) + 1;
});
