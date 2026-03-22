import { ErrorCode } from "../errors/codes.ts";
import { MappingError } from "../errors/types.ts";

/** Converts values between database driver types and TypeScript types. */
export interface TypeHandler<T = unknown> {
  fromDb(raw: unknown): T;
  toDb(value: T): unknown;
}

const stringHandler: TypeHandler<string> = {
  fromDb(raw: unknown): string {
    return String(raw);
  },
  toDb(value: string): unknown {
    return value;
  },
};

const numberHandler: TypeHandler<number> = {
  fromDb(raw: unknown): number {
    return Number(raw);
  },
  toDb(value: number): unknown {
    return value;
  },
};

const booleanHandler: TypeHandler<boolean> = {
  fromDb(raw: unknown): boolean {
    if (typeof raw === "number") return raw !== 0;
    if (typeof raw === "string") return raw === "true" || raw === "1";
    return Boolean(raw);
  },
  toDb(value: boolean): unknown {
    return value;
  },
};

const dateHandler: TypeHandler<Date> = {
  fromDb(raw: unknown): Date {
    if (raw instanceof Date) return raw;
    return new Date(raw as string | number);
  },
  toDb(value: Date): unknown {
    return value;
  },
};

const bigintHandler: TypeHandler<number> = {
  fromDb(raw: unknown): number {
    if (typeof raw === "bigint") return Number(raw);
    return Number(raw);
  },
  toDb(value: number): unknown {
    return value;
  },
};

const bufferHandler: TypeHandler<Buffer> = {
  fromDb(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    return Buffer.from(raw as string, "base64");
  },
  toDb(value: Buffer): unknown {
    return value;
  },
};

const nullHandler: TypeHandler<null> = {
  fromDb(_raw: unknown): null {
    return null;
  },
  toDb(_value: null): unknown {
    return null;
  },
};

const jsonHandler: TypeHandler<unknown> = {
  fromDb(raw: unknown): unknown {
    if (typeof raw === "string") return JSON.parse(raw);
    return raw;
  },
  toDb(value: unknown): unknown {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  },
};

const identityHandler: TypeHandler<unknown> = {
  fromDb(raw: unknown): unknown {
    return raw;
  },
  toDb(value: unknown): unknown {
    return value;
  },
};

const BUILT_IN_HANDLERS = new Map<string, TypeHandler>([
  ["int", numberHandler],
  ["bigint", bigintHandler],
  ["smallint", numberHandler],
  ["float", numberHandler],
  ["decimal", numberHandler],
  ["boolean", booleanHandler],
  ["text", stringHandler],
  ["nvarchar", stringHandler],
  ["varchar", stringHandler],
  ["char", stringHandler],
  ["datetime", dateHandler],
  ["date", dateHandler],
  ["time", stringHandler],
  ["uuid", stringHandler],
  ["blob", bufferHandler],
  ["json", jsonHandler],
  ["array", identityHandler],
]);

/**
 * Registers and looks up TypeHandlers by column type string.
 * Built-in handlers cover all standard column types.
 * Unknown types fall back to an identity handler that passes values through unchanged.
 */
export class TypeHandlerRegistry {
  private readonly handlers = new Map<string, TypeHandler>(BUILT_IN_HANDLERS);

  /** Registers a custom handler for a column type, overriding any built-in. */
  register<T>(dbType: string, handler: TypeHandler<T>): void {
    this.handlers.set(dbType, handler as TypeHandler);
  }

  /** Returns the handler for a column type. Falls back to identity for unknown types. */
  get(dbType: string): TypeHandler {
    return this.handlers.get(dbType) ?? identityHandler;
  }

  /** Converts a raw database value to the TypeScript type for the given column type. */
  fromDb(dbType: string, raw: unknown): unknown {
    if (raw === null || raw === undefined) return null;
    return this.get(dbType).fromDb(raw);
  }

  /** Converts a TypeScript value to the database type for the given column type. */
  toDb(dbType: string, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    return this.get(dbType).toDb(value);
  }
}
