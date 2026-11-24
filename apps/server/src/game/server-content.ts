import { loadContentPacks, type LoadedContent } from '@snails/core';
import { basePack } from '@snails/content-base';

let loaded: LoadedContent | undefined;

/**
 * Loads (once) the content the server plays with: the base pack through `loadContentPacks`
 * (validated, cross-referenced, frozen). Add mod packs to the list here.
 * @throws ContentPackError if the packs are invalid.
 */
export function loadServerContent(): LoadedContent {
  loaded ??= loadContentPacks([basePack]);
  return loaded;
}
