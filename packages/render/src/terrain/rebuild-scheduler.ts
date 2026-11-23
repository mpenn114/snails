/** Per-frame time budget for main-thread chunk rebuild work (extract/post and upload/apply). */

/** Default per-frame budget in milliseconds. */
export const DEFAULT_REBUILD_BUDGET_MS = 8;

/** Monotonic clock in milliseconds. */
export type NowFn = () => number;

/** Snapshot of scheduler statistics (for the debug overlay). */
export interface RebuildStats {
  /** Frames measured so far. */
  readonly frames: number;
  /** Main-thread ms spent on rebuild work in the last frame. */
  readonly lastFrameMs: number;
  /** Chunk meshes applied in the last frame. */
  readonly lastApplied: number;
  /** Chunk jobs dispatched in the last frame. */
  readonly lastDispatched: number;
  /** Dirty chunks awaiting dispatch plus finished meshes awaiting apply. */
  readonly backlog: number;
  /** Frames whose rebuild work exceeded the budget. */
  readonly stalls: number;
  /** Largest per-frame time seen. */
  readonly worstFrameMs: number;
  /** Total meshes applied. */
  readonly totalApplied: number;
  /** Total jobs dispatched. */
  readonly totalDispatched: number;
}

/** Tracks time spent per frame and decides when to stop starting new work. */
export class RebuildScheduler {
  /** Budget per frame in ms. */
  budgetMs: number;
  private readonly now: NowFn;
  private start = 0;
  private done = 0;
  private applied = 0;
  private dispatched = 0;
  private frames = 0;
  private stalls = 0;
  private lastMs = 0;
  private lastApplied = 0;
  private lastDispatched = 0;
  private worst = 0;
  private totalApplied = 0;
  private totalDispatched = 0;
  private backlog = 0;

  /** Creates a scheduler; `now` defaults to `performance.now`. */
  constructor(budgetMs = DEFAULT_REBUILD_BUDGET_MS, now: NowFn = () => performance.now()) {
    this.budgetMs = budgetMs;
    this.now = now;
  }

  /** Changes the per-frame budget (takes effect from the next `canStart`). */
  setBudget(ms: number): void {
    this.budgetMs = ms;
  }

  /** Starts a frame's accounting. */
  beginFrame(): void {
    this.start = this.now();
    this.done = 0;
    this.applied = 0;
    this.dispatched = 0;
  }

  /** True when another item may start: always for the first of a frame, else while under budget. */
  canStart(): boolean {
    return this.done === 0 || this.now() - this.start < this.budgetMs;
  }

  /** Records a finished unit of work of the given kind. */
  record(kind: 'apply' | 'dispatch' | 'skip'): void {
    this.done++;
    if (kind === 'apply') this.applied++;
    else if (kind === 'dispatch') this.dispatched++;
  }

  /** Ends the frame, updating stats; `backlog` is the work still queued. */
  endFrame(backlog: number): void {
    const ms = this.now() - this.start;
    this.frames++;
    this.lastMs = ms;
    this.lastApplied = this.applied;
    this.lastDispatched = this.dispatched;
    this.totalApplied += this.applied;
    this.totalDispatched += this.dispatched;
    this.backlog = backlog;
    if (ms > this.budgetMs) this.stalls++;
    if (ms > this.worst) this.worst = ms;
  }

  /** Current statistics. */
  get stats(): RebuildStats {
    return {
      frames: this.frames,
      lastFrameMs: this.lastMs,
      lastApplied: this.lastApplied,
      lastDispatched: this.lastDispatched,
      backlog: this.backlog,
      stalls: this.stalls,
      worstFrameMs: this.worst,
      totalApplied: this.totalApplied,
      totalDispatched: this.totalDispatched,
    };
  }
}
