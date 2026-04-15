import { expectTypeOf, test } from "vitest";
import { q } from "../lib/q";
import type {
  ResolveQueryData,
  ResolveQueryStore,
  ResolveQueryStoreUnit,
} from "../types/resolve";

interface Filters {
  preview: boolean;
  status: "completed" | "in-progress";
}

test("q.createQueryKeys infers the generated store unit", () => {
  const users = q.createQueryKeys("users", {
    me: q.static({}),
    session: q.static({
      queryFn: () => Promise.resolve({ active: true }),
      staleTime: 1000,
    }),
    detail: q.dynamic((userId: string) =>
      q.static({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId }),
        settings: q.static({}),
      })
    ),
  });

  expectTypeOf(users._def).toEqualTypeOf<readonly ["users"]>();
  expectTypeOf(users.me.queryKey).toEqualTypeOf<readonly ["users", "me"]>();
  expectTypeOf(users.session.queryKey).toEqualTypeOf<
    readonly ["users", "session"]
  >();
  expectTypeOf(users.detail._def).toEqualTypeOf<readonly ["users", "detail"]>();
  expectTypeOf(users.detail).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(users.detail("user_1").queryKey).toExtend<readonly unknown[]>();
  expectTypeOf(users.detail("user_1").settings.queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf<
    ResolveQueryData<ReturnType<typeof users.detail>>
  >().toEqualTypeOf<{
    id: string;
  }>();
  expectTypeOf<
    ResolveQueryStoreUnit<typeof users>["detail"]
  >().toExtend<object>();
});

test("q.tupleKey preserves non-string serializable values", () => {
  const products = q.createQueryKeys("products", {
    filtered: q.dynamic(
      (
        page: number,
        preview: boolean,
        filters: { status: "active" | "archived" }
      ) =>
        q.static({
          queryKey: q.tupleKey(page, preview, filters),
          queryFn: () => Promise.resolve([] as const),
        })
    ),
  });

  expectTypeOf(products.filtered._def).toEqualTypeOf<
    readonly ["products", "filtered"]
  >();
  expectTypeOf(
    products.filtered(1, true, { status: "active" }).queryKey
  ).toEqualTypeOf<
    readonly [
      "products",
      "filtered",
      number,
      boolean,
      { status: "active" | "archived" },
    ]
  >();
});

test("q.createQueryKeyStore infers the query store shape", () => {
  const store = q.createQueryKeyStore({
    users: {
      me: q.static({}),
      detail: q.dynamic((userId: string) =>
        q.static({
          queryKey: [userId],
          queryFn: () => Promise.resolve({ id: userId }),
        })
      ),
    },
    todos: {
      detail: q.dynamic((todoId: string) =>
        q.static({
          queryKey: [todoId],
        })
      ),
      list: q.dynamic((filters: Filters) =>
        q.static({
          queryKey: [{ filters }],
        })
      ),
    },
  });

  expectTypeOf(store.users._def).toEqualTypeOf<readonly ["users"]>();
  expectTypeOf(store.todos._def).toEqualTypeOf<readonly ["todos"]>();
  expectTypeOf(store.users.detail("user_1").queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(
    store.todos.list({ preview: true, status: "completed" }).queryKey
  ).toExtend<readonly unknown[]>();
  expectTypeOf<ResolveQueryStore<typeof store>["users"]>().toExtend<object>();
});

test("q.mergeQueryKeys infers merged stores and same-key merges", () => {
  const users = q.createQueryKeys("users", {
    me: q.static({}),
    detail: q.dynamic((userId: string) =>
      q.static({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId }),
        settings: q.static({}),
      })
    ),
  });
  const todos = q.createQueryKeys("todos", {
    detail: q.dynamic((todoId: string) =>
      q.static({
        queryKey: [todoId],
      })
    ),
    list: q.dynamic((filters: Filters) =>
      q.static({
        queryKey: [{ filters }],
      })
    ),
    search: q.dynamic((query: string, limit: number) =>
      q.static({
        queryKey: [query, limit],
      })
    ),
  });
  const merged = q.mergeQueryKeys(users, todos);

  expectTypeOf(merged.users._def).toEqualTypeOf<readonly ["users"]>();
  expectTypeOf(merged.todos._def).toEqualTypeOf<readonly ["todos"]>();
  expectTypeOf(merged.users.detail("user_1").settings.queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(merged.todos.search("query", 5).queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf<ResolveQueryStore<typeof merged>["users"]>().toExtend<object>();

  const todosBase = q.createQueryKeys("todos", {
    detail: q.dynamic((todoId: string) =>
      q.static({
        queryKey: [todoId],
      })
    ),
  });
  const todosSearch = q.createQueryKeys("todos", {
    search: q.dynamic((query: string, limit: number) =>
      q.static({
        queryKey: [query, limit],
      })
    ),
  });
  const mergedTodos = q.mergeQueryKeys(todosBase, todosSearch);

  expectTypeOf(mergedTodos.todos._def).toEqualTypeOf<readonly ["todos"]>();
  expectTypeOf(mergedTodos.todos.search("query", 5).queryKey).toExtend<
    readonly unknown[]
  >();
});

test("nested child queries keep inferred store output", () => {
  const nested = q.createQueryKeys("test", {
    prop: q.dynamic((value: string) =>
      q.static({
        queryKey: [value],
        nested1: q.static({}),
        nested2: q.static({
          queryKey: ["context-prop-2"],
        }),
        nested3: q.dynamic((nestedValue: string) =>
          q.static({
            queryKey: [nestedValue],
            nested4: q.static({}),
          })
        ),
      })
    ),
  });

  expectTypeOf(nested._def).toEqualTypeOf<readonly ["test"]>();
  expectTypeOf(nested.prop._def).toEqualTypeOf<readonly ["test", "prop"]>();
  expectTypeOf(nested.prop("value").nested1.queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(nested.prop("value").nested2.queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(nested.prop("value").nested3._def).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(
    nested.prop("value").nested3("nested").nested4.queryKey
  ).toExtend<readonly unknown[]>();
  expectTypeOf<
    ResolveQueryStoreUnit<typeof nested>["prop"]
  >().toExtend<object>();
});

test("nested child queryFns keep the same context typing", () => {
  const sessions = q.createQueryKeys("sessions", {
    get: q.dynamic((sessionId: string) =>
      q.static({
        queryKey: [sessionId],
        queryFn: (ctx) => {
          expectTypeOf(ctx.signal).toExtend<AbortSignal | undefined>();
          return Promise.resolve({ id: sessionId, key: ctx.queryKey });
        },
        listMessages: q.static({
          queryKey: [sessionId, "messages"],
          queryFn: (ctx) => {
            expectTypeOf(ctx).not.toBeAny();
            expectTypeOf(ctx.signal).toExtend<AbortSignal | undefined>();
            return Promise.resolve({ sessionId, key: ctx.queryKey });
          },
        }),
      })
    ),
  });

  const session = sessions.get("session_1");
  expectTypeOf(session.queryFn).parameter(0).not.toBeAny();
  expectTypeOf(session.listMessages.queryFn).parameter(0).not.toBeAny();
  expectTypeOf(session.listMessages.queryFn)
    .parameter(0)
    .toHaveProperty("signal");
});

test("static parents preserve nested queryFn context typing", () => {
  const session = q.createQueryKeys("session", {
    me: q.static({
      queryFn: ({ signal }) => {
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        return Promise.resolve({ authenticated: true as boolean });
      },
      organizationBySlug: q.dynamic((organizationSlug: string) =>
        q.static({
          queryKey: ["organization", organizationSlug],
          queryFn: ({ signal }) => {
            expectTypeOf(signal).not.toBeAny();
            expectTypeOf(signal).toExtend<AbortSignal | undefined>();
            return Promise.resolve({ slug: organizationSlug });
          },
          membership: q.static({
            queryKey: null,
            queryFn: ({ signal }) => {
              expectTypeOf(signal).not.toBeAny();
              expectTypeOf(signal).toExtend<AbortSignal | undefined>();
              return Promise.resolve({ active: true as boolean });
            },
          }),
        })
      ),
    }),
  });

  expectTypeOf(session.me.queryFn).parameter(0).not.toBeAny();
  expectTypeOf(session.me.organizationBySlug)
    .parameter(0)
    .toEqualTypeOf<string>();
  expectTypeOf(session.me.organizationBySlug("acme").queryFn)
    .parameter(0)
    .not.toBeAny();
  expectTypeOf(session.me.organizationBySlug("acme").membership.queryFn)
    .parameter(0)
    .not.toBeAny();
});

test("q.tupleKey preserves exact deep nested query tuples", () => {
  const products = q.createQueryKeys("products", {
    detail: q.dynamic((sku: string) =>
      q.static({
        queryKey: q.tupleKey(sku),
        recommendedProducts: q.dynamic((region: string) =>
          q.static({
            queryKey: q.tupleKey(region),
            byWarehouse: q.dynamic((warehouseId: string) =>
              q.static({
                queryKey: q.tupleKey(warehouseId),
              })
            ),
            fallback: q.static({
              queryKey: q.tupleKey("fallback"),
            }),
          })
        ),
      })
    ),
  });

  expectTypeOf(products.detail("sku_1").queryKey).toEqualTypeOf<
    readonly ["products", "detail", string]
  >();
  expectTypeOf(products.detail("sku_1").recommendedProducts._def).toEqualTypeOf<
    readonly ["products", "detail", string, "recommendedProducts"]
  >();
  expectTypeOf(
    products.detail("sku_1").recommendedProducts("us").queryKey
  ).toEqualTypeOf<
    readonly ["products", "detail", string, "recommendedProducts", string]
  >();
  expectTypeOf(
    products.detail("sku_1").recommendedProducts("us").fallback.queryKey
  ).toEqualTypeOf<
    readonly [
      "products",
      "detail",
      string,
      "recommendedProducts",
      string,
      "fallback",
      "fallback",
    ]
  >();
  expectTypeOf(
    products
      .detail("sku_1")
      .recommendedProducts("us")
      .byWarehouse("warehouse_1").queryKey
  ).toEqualTypeOf<
    readonly [
      "products",
      "detail",
      string,
      "recommendedProducts",
      string,
      "byWarehouse",
      string,
    ]
  >();
});
