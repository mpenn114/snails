/**
 * Tries to capture the pointer so moves outside the element keep arriving. Safari can throw
 * (`InvalidStateError`, or `NotFoundError` after the pointer already ended), so failures are
 * reported to the caller, which then falls back to window-level listeners.
 */
export function tryCapture(el: Pick<HTMLElement, 'setPointerCapture'>, id: number): boolean {
  try {
    el.setPointerCapture(id);
    return true;
  } catch {
    return false;
  }
}
