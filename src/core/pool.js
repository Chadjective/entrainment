// ============================================================================
// System 14 — tiny object pool. Recycles game objects to avoid per-spawn
// allocation + per-despawn disposal (the GC churn that causes frame hitches
// over a long run). `create` builds a fresh object only when the free list is
// empty; released objects are reused.
// ============================================================================

export class Pool {
  constructor(create) {
    this._create = create;
    this._free = [];
    this.created = 0; // total ever built (for diagnostics / tests)
  }

  acquire() {
    if (this._free.length) return this._free.pop();
    this.created++;
    return this._create();
  }

  release(obj) {
    this._free.push(obj);
  }

  // dispose every pooled object (full teardown only)
  drain(dispose) {
    if (dispose) for (const o of this._free) dispose(o);
    this._free.length = 0;
  }
}
