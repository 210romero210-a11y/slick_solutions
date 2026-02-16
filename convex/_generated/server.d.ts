export declare function mutation(config: {
  args: Record<string, unknown>;
  handler: (ctx: {
    db: {
      insert: (
        table: string,
        value: Record<string, unknown>
      ) => Promise<string>;
      query: (table: string) => {
        withIndex: (
          name: string,
          cb: (q: { eq: (field: string, value: string) => unknown }) => unknown
        ) => { collect: () => Promise<unknown[]> };
      };
    };
  }, args: Record<string, unknown>) => Promise<unknown>;
}): unknown;

export declare function query(config: {
  args: Record<string, unknown>;
  handler: (ctx: {
    db: {
      query: (table: string) => {
        withIndex: (
          name: string,
          cb: (q: { eq: (field: string, value: string) => unknown }) => unknown
        ) => { collect: () => Promise<unknown[]> };
      };
    };
  }, args: Record<string, unknown>) => Promise<unknown>;
}): unknown;

export declare function action(config: {
  args: Record<string, unknown>;
  handler: (
    ctx: Record<string, never>,
    args: Record<string, never>
  ) => Promise<unknown>;
}): unknown;

export declare function httpAction(
  handler: (ctx: Record<string, never>, request: Request) => Promise<Response>
): (ctx: Record<string, never>, request: Request) => Promise<Response>;
