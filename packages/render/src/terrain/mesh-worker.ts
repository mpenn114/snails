/** Web Worker entry: meshes chunks off the main thread. Loaded via `new Worker(...)`. */
import { handleMeshRequest, responseTransferables, type MeshRequest } from './mesh-protocol.js';

interface WorkerScope {
  onmessage: ((ev: { data: MeshRequest }) => void) | null;
  postMessage(msg: unknown, transfer: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (ev) => {
  const res = handleMeshRequest(ev.data);
  scope.postMessage(res, responseTransferables(res));
};
