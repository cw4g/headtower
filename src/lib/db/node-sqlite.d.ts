/**
 * Ambient types for Node's built-in `node:sqlite` module.
 *
 * `@types/node@20` (this project's pinned version) predates the `node:sqlite`
 * declarations, so `import { DatabaseSync } from "node:sqlite"` would otherwise
 * fail to type-check. This declares only the synchronous surface Headtower's DB
 * client actually uses, matching the runtime API in Node 22.5+/24. Remove this
 * file once `@types/node` is bumped to a version that ships these types.
 *
 * Reference: https://nodejs.org/api/sqlite.html
 */
declare module "node:sqlite" {
  /** Value types SQLite can bind/return through `node:sqlite`. */
  export type SupportedValueType = null | number | bigint | string | Uint8Array;

  /** Metadata for one result column, as returned by `StatementSync.columns()`. */
  export interface ColumnNameMetadata {
    readonly column: string | null;
    readonly database: string | null;
    readonly name: string;
    readonly table: string | null;
    readonly type: string | null;
  }

  /** Result of an executed write statement (`INSERT`/`UPDATE`/`DELETE`). */
  export interface StatementResultingChanges {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  }

  /** A compiled, reusable prepared statement bound to a `DatabaseSync`. */
  export interface StatementSync {
    all(...params: SupportedValueType[]): unknown[];
    get(...params: SupportedValueType[]): unknown;
    run(...params: SupportedValueType[]): StatementResultingChanges;
    iterate(...params: SupportedValueType[]): IterableIterator<unknown>;
    columns(): ColumnNameMetadata[];
    /** When enabled, rows are returned as positional arrays instead of objects. */
    setReturnArrays(enabled: boolean): void;
    setReadBigInts(enabled: boolean): void;
    setAllowBareNamedParameters(enabled: boolean): void;
    setAllowUnknownNamedParameters(enabled: boolean): void;
    readonly expandedSQL: string;
    readonly sourceSQL: string;
  }

  /** Options accepted by the {@link DatabaseSync} constructor. */
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }

  /** A synchronous SQLite database connection. */
  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    readonly isOpen: boolean;
    open(): void;
    close(): void;
    /** Execute one or more statements with no parameters and no result rows. */
    exec(sql: string): void;
    /** Compile a SQL string into a reusable {@link StatementSync}. */
    prepare(sql: string): StatementSync;
  }
}
