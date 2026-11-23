import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

/** Terrain material layers that carry a texture. */
export const TERRAIN_LAYERS = ['grass', 'dirt', 'rock'] as const;
/** A terrain texture layer name. */
export type TerrainLayer = (typeof TERRAIN_LAYERS)[number];

/** URLs of one texture layer. */
export interface TerrainLayerUrls {
  /** Neutralised colour map (mean 0.5; the palette supplies the hue). */
  color: string;
  /** Tangent-space normal map (OpenGL convention); omitted on cheap tiers. */
  normal?: string;
}

/** URLs for every layer. */
export type TerrainTextureSet = Record<TerrainLayer, TerrainLayerUrls>;

/** Texture sets supplied by the app: `full` (1K colour + normals) and `compact` (512 colour). */
export interface TerrainTextureSources {
  full: TerrainTextureSet;
  compact: TerrainTextureSet;
  /** Anisotropic filtering level (default {@link DEFAULT_ANISOTROPY}); 1 for slow software GL. */
  anisotropy?: number;
}

/** Default anisotropic filtering level for terrain maps (the GPU clamps it to its maximum). */
export const DEFAULT_ANISOTROPY = 4;

/** Loaded textures of one layer. */
export interface TerrainLayerTextures {
  color: Texture;
  normal?: Texture;
}

/** Loaded textures for every layer. */
export type TerrainTextures = Record<TerrainLayer, TerrainLayerTextures>;

/** Async texture source (injectable for tests). */
export type TextureFetch = (url: string) => Promise<Texture>;

/** Picks the set for a tier: `detail` tiers get `full`, the rest `compact` without normals. */
export function pickTextureSet(sources: TerrainTextureSources, detail: boolean): TerrainTextureSet {
  if (detail) return sources.full;
  const out = {} as TerrainTextureSet;
  for (const l of TERRAIN_LAYERS) out[l] = { color: sources.compact[l].color };
  return out;
}

/** 1x1 texture; neutral colour (0.5 grey) or a flat tangent-space normal. */
export function createNeutralTexture(kind: 'color' | 'normal'): DataTexture {
  const data = kind === 'color' ? [128, 128, 128, 255] : [128, 128, 255, 255];
  const tex = new DataTexture(new Uint8Array(data), 1, 1, RGBAFormat);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Applies repeat wrapping, mipmaps and the right colour space to a loaded layer map. */
export function configureTerrainTexture(
  tex: Texture,
  kind: 'color' | 'normal',
  anisotropy = DEFAULT_ANISOTROPY,
): Texture {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  if (kind === 'color') tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Default browser loader (`THREE.TextureLoader`). */
export function browserTextureFetch(): TextureFetch {
  const loader = new TextureLoader();
  return (url) => loader.loadAsync(url);
}

/**
 * Loads every texture of a set. Rejects if any fails; callers keep the palette fallback then.
 * All loaded textures are disposed again if a sibling fails.
 */
export async function loadTerrainTextures(
  set: TerrainTextureSet,
  fetchTexture: TextureFetch = browserTextureFetch(),
  anisotropy = DEFAULT_ANISOTROPY,
): Promise<TerrainTextures> {
  const loaded: Texture[] = [];
  const get = async (url: string, kind: 'color' | 'normal'): Promise<Texture> => {
    const t = configureTerrainTexture(await fetchTexture(url), kind, anisotropy);
    loaded.push(t);
    return t;
  };
  try {
    const entries = await Promise.all(
      TERRAIN_LAYERS.map(async (l) => {
        const url = set[l];
        const color = await get(url.color, 'color');
        const normal = url.normal ? await get(url.normal, 'normal') : undefined;
        return [l, normal ? { color, normal } : { color }] as const;
      }),
    );
    return Object.fromEntries(entries) as TerrainTextures;
  } catch (e) {
    for (const t of loaded) t.dispose();
    throw e;
  }
}
