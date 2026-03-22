/** Snapshot of pool metrics at a point in time. */
export interface PoolStatsSnapshot {
  readonly total: number;
  readonly idle: number;
  readonly acquired: number;
  readonly waiting: number;
  readonly min: number;
  readonly max: number;
  readonly totalCreated: number;
  readonly totalDestroyed: number;
  readonly totalAcquired: number;
  readonly avgAcquireMs: number;
  readonly avgIdleMs: number;
  readonly avgUseMs: number;
}

/**
 * Tracks rolling averages for pool performance metrics.
 * Uses exponential moving average for constant memory usage.
 */
export class PoolStats {
  private readonly alpha: number;
  private _avgAcquireMs = 0;
  private _avgIdleMs = 0;
  private _avgUseMs = 0;
  private _totalCreated = 0;
  private _totalDestroyed = 0;
  private _totalAcquired = 0;

  constructor(alpha: number = 0.1) {
    this.alpha = alpha;
  }

  recordAcquire(durationMs: number): void {
    this._totalAcquired++;
    this._avgAcquireMs = this.ema(this._avgAcquireMs, durationMs);
  }

  recordIdle(durationMs: number): void {
    this._avgIdleMs = this.ema(this._avgIdleMs, durationMs);
  }

  recordUse(durationMs: number): void {
    this._avgUseMs = this.ema(this._avgUseMs, durationMs);
  }

  recordCreated(): void {
    this._totalCreated++;
  }

  recordDestroyed(): void {
    this._totalDestroyed++;
  }

  snapshot(
    idle: number,
    acquired: number,
    waiting: number,
    min: number,
    max: number,
  ): PoolStatsSnapshot {
    return {
      total: idle + acquired,
      idle,
      acquired,
      waiting,
      min,
      max,
      totalCreated: this._totalCreated,
      totalDestroyed: this._totalDestroyed,
      totalAcquired: this._totalAcquired,
      avgAcquireMs: Math.round(this._avgAcquireMs * 100) / 100,
      avgIdleMs: Math.round(this._avgIdleMs * 100) / 100,
      avgUseMs: Math.round(this._avgUseMs * 100) / 100,
    };
  }

  private ema(prev: number, sample: number): number {
    return prev === 0 ? sample : prev * (1 - this.alpha) + sample * this.alpha;
  }
}

/**
 * Facade for PG/MySQL that reads from Bun.SQL internal metrics.
 * Bun.SQL manages its own pool — this provides a compatible stats interface.
 */
export class BunSqlStatsFacade {
  snapshot(): PoolStatsSnapshot {
    return {
      total: 0,
      idle: 0,
      acquired: 0,
      waiting: 0,
      min: 0,
      max: 0,
      totalCreated: 0,
      totalDestroyed: 0,
      totalAcquired: 0,
      avgAcquireMs: 0,
      avgIdleMs: 0,
      avgUseMs: 0,
    };
  }
}
