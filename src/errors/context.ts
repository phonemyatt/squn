/**
 * Structured context attached to every SqunError.
 *
 * All fields are optional — each error subclass populates only the fields
 * relevant to its failure mode. Consumers should never assume a field is
 * present without checking.
 */
export interface ErrorContext {
  /** The high-level operation that failed (e.g. "query", "execute", "commit"). */
  readonly operation?: string;

  /** Sanitised SQL text — param values are never included. */
  readonly sql?: string;

  /** Param key names from the query (values are never logged). */
  readonly paramKeys?: readonly string[];

  /** Which database adapter was in use ("sqlite" | "postgres" | "mysql" | "mssql"). */
  readonly adapter?: string;

  /** Table name relevant to the error. */
  readonly table?: string;

  /** Column name relevant to the error. */
  readonly column?: string;

  /** Row index within a TVP batch where validation failed. */
  readonly tvpRowIndex?: number;

  /** Row index within a result set where mapping failed. */
  readonly rowIndex?: number;

  /** Elapsed wall-clock time in milliseconds when the error occurred. */
  readonly durationMs?: number;

  /** Transaction identifier — ties the error to a specific transaction scope. */
  readonly txId?: string;

  /** Connection name that was requested but not found in the registry. */
  readonly requestedName?: string;

  /** Connection names currently registered — aids debugging CONN_UNKNOWN errors. */
  readonly registeredNames?: readonly string[];
}
