/** Message protocol and pure handler shared by the mesh worker and its clients. */
import { meshChunk, type ChunkMesh, type ChunkMeshInput } from './marching-cubes.js';

/** Request to mesh one chunk. `input.samples` is transferred to the worker. */
export interface MeshRequest {
  readonly id: number;
  readonly chunkKey: number;
  readonly input: ChunkMeshInput;
}

/** Reply with the meshed chunk. Mesh buffers are transferred back. */
export interface MeshResponse {
  readonly id: number;
  readonly chunkKey: number;
  readonly mesh: ChunkMesh;
}

/** Collects the distinct, non-empty ArrayBuffers to transfer with a message. */
export function collectTransferables(
  ...arrays: readonly (Float32Array | Uint32Array)[]
): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  for (const a of arrays) {
    if (a.byteLength > 0 && a.buffer instanceof ArrayBuffer) out.add(a.buffer);
  }
  return [...out];
}

/** Buffers to transfer with a request. */
export function requestTransferables(req: MeshRequest): ArrayBuffer[] {
  return collectTransferables(req.input.samples);
}

/** Buffers to transfer with a response. */
export function responseTransferables(res: MeshResponse): ArrayBuffer[] {
  return collectTransferables(res.mesh.positions, res.mesh.normals, res.mesh.indices);
}

/** Pure worker logic: meshes the request's chunk. Unit-testable without a Worker. */
export function handleMeshRequest(req: MeshRequest): MeshResponse {
  return { id: req.id, chunkKey: req.chunkKey, mesh: meshChunk(req.input) };
}
