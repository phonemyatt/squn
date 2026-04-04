export type ConnectionState = "CREATED" | "IDLE" | "ACQUIRED" | "DEAD";

/**
 * Wraps a single database connection with lifecycle state tracking.
 * State machine: CREATED → IDLE → ACQUIRED → IDLE → … → DEAD
 */
export class PooledConnection {
  private _state: ConnectionState = "CREATED";
  private _useCount = 0;
  private readonly _createdAt: number;
  private _lastUsedAt: number;
  private _acquiredAt: number | null = null;

  readonly id: string;

  constructor(id: string) {
    this.id = id;
    this._createdAt = Date.now();
    this._lastUsedAt = this._createdAt;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get useCount(): number {
    return this._useCount;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  get lastUsedAt(): number {
    return this._lastUsedAt;
  }

  get acquiredAt(): number | null {
    return this._acquiredAt;
  }

  /** Transition to IDLE — valid from CREATED or ACQUIRED. */
  markIdle(): void {
    this._state = "IDLE";
    this._acquiredAt = null;
  }

  /** Transition to ACQUIRED — valid from IDLE. */
  markAcquired(): void {
    this._state = "ACQUIRED";
    this._useCount++;
    this._lastUsedAt = Date.now();
    this._acquiredAt = Date.now();
  }

  /** Transition to DEAD — valid from any state. */
  markDead(): void {
    this._state = "DEAD";
  }

  /** Whether this connection should be recycled based on age or use count. */
  shouldRecycle(
    maxAgeMs: number | undefined,
    maxUseCount: number | undefined,
  ): boolean {
    if (maxAgeMs !== undefined && maxAgeMs > 0) {
      if (Date.now() - this._createdAt >= maxAgeMs) return true;
    }
    if (maxUseCount !== undefined && maxUseCount > 0) {
      if (this._useCount >= maxUseCount) return true;
    }
    return false;
  }

  /** Age in milliseconds since creation. */
  get ageMs(): number {
    return Date.now() - this._createdAt;
  }

  /** Time in milliseconds since last acquired (or since creation if never acquired). */
  get idleMs(): number {
    return Date.now() - this._lastUsedAt;
  }
}
