declare module "sql.js" {
  interface Database {
    run(sql: string, params?: any): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    close(): void;
  }

  interface Statement {
    bind(params?: any): boolean;
    step(): boolean;
    getAsObject(): Record<string, any>;
    free(): boolean;
    reset(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export function initSqlJs(config?: any): Promise<SqlJsStatic>;
  export { Database };
  export default initSqlJs;
}