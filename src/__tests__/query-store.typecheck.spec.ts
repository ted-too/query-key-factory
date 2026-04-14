import { expectTypeOf, test } from "vitest";
import { createQueryKeyStore } from "../lib/create-query-key-store";
import { createQueryKeys } from "../lib/create-query-keys";
import { mergeQueryKeys } from "../lib/merge-query-keys";
import { tupleKey } from "../lib/tuple-key";
import type {
  ResolveQueryData,
  ResolveQueryStore,
  ResolveQueryStoreUnit,
} from "../types/resolve";

interface Filters {
  preview: boolean;
  status: "completed" | "in-progress";
}

test("createQueryKeys infers the generated store unit", () => {
  const users = createQueryKeys("users", {
    me: null,
    session: {
      queryFn: () => Promise.resolve({ active: true }),
    },
    detail: (userId: string) => ({
      queryKey: [userId],
      queryFn: () => Promise.resolve({ id: userId }),
      settings: null,
    }),
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
  expectTypeOf<ResolveQueryData<typeof users.detail>>().toEqualTypeOf<{
    id: string;
  }>();
  expectTypeOf<
    ResolveQueryStoreUnit<typeof users>["detail"]
  >().toExtend<object>();
});

test("query keys support non-string serializable values", () => {
  const products = createQueryKeys("products", {
    filtered: (
      page: number,
      preview: boolean,
      filters: { status: "active" | "archived" }
    ) => ({
      queryKey: tupleKey(page, preview, filters),
      queryFn: () => Promise.resolve([] as const),
    }),
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

test("createQueryKeyStore infers the query store shape", () => {
  const store = createQueryKeyStore({
    users: {
      me: null,
      detail: (userId: string) => ({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId }),
      }),
    },
    todos: {
      detail: (todoId: string) => [todoId],
      list: (filters: Filters) => [{ filters }],
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

test("mergeQueryKeys infers merged stores and same-key merges", () => {
  const users = createQueryKeys("users", {
    me: null,
    detail: (userId: string) => ({
      queryKey: [userId],
      queryFn: () => Promise.resolve({ id: userId }),
      settings: null,
    }),
  });
  const todos = createQueryKeys("todos", {
    detail: (todoId: string) => [todoId],
    list: (filters: Filters) => [{ filters }],
    search: (query: string, limit: number) => [query, limit],
  });
  const merged = mergeQueryKeys(users, todos);

  expectTypeOf(merged.users._def).toEqualTypeOf<readonly ["users"]>();
  expectTypeOf(merged.todos._def).toEqualTypeOf<readonly ["todos"]>();
  expectTypeOf(merged.users.detail("user_1").settings.queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf(merged.todos.search("query", 5).queryKey).toExtend<
    readonly unknown[]
  >();
  expectTypeOf<ResolveQueryStore<typeof merged>["users"]>().toExtend<object>();

  const todosBase = createQueryKeys("todos", {
    detail: (todoId: string) => [todoId],
  });
  const todosSearch = createQueryKeys("todos", {
    search: (query: string, limit: number) => [query, limit],
  });
  const mergedTodos = mergeQueryKeys(todosBase, todosSearch);

  expectTypeOf(mergedTodos.todos._def).toEqualTypeOf<readonly ["todos"]>();
  expectTypeOf(mergedTodos.todos.search("query", 5).queryKey).toExtend<
    readonly unknown[]
  >();
});

test("nested child queries keep inferred store output", () => {
  const nested = createQueryKeys("test", {
    prop: (value: string) => ({
      queryKey: [value],
      nested1: null,
      nested2: ["context-prop-2"],
      nested3: (nestedValue: string) => ({
        queryKey: [nestedValue],
        nested4: null,
      }),
    }),
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
  const sessions = createQueryKeys("sessions", {
    get: (sessionId: string) => ({
      queryKey: [sessionId],
      queryFn: (ctx) => {
        expectTypeOf(ctx.signal).toExtend<AbortSignal | undefined>();
        return Promise.resolve({ id: sessionId, key: ctx.queryKey });
      },
      listMessages: {
        queryKey: [sessionId, "messages"],
        queryFn: (ctx) => {
          expectTypeOf(ctx).not.toBeAny();
          expectTypeOf(ctx.signal).toExtend<AbortSignal | undefined>();
          return Promise.resolve({ sessionId, key: ctx.queryKey });
        },
      },
    }),
  });

  const session = sessions.get("session_1");
  expectTypeOf(session.queryFn).parameter(0).not.toBeAny();
  expectTypeOf(session.queryFn).parameter(0).toEqualTypeOf<
    Parameters<typeof session.listMessages.queryFn>[0]
  >();
});

test("tupleKey preserves exact deep nested query tuples", () => {
  const products = createQueryKeys("products", {
    detail: (sku: string) => ({
      queryKey: tupleKey(sku),
      recommendedProducts: (region: string) => ({
        queryKey: tupleKey(region),
        byWarehouse: (warehouseId: string) => ({
          queryKey: tupleKey(warehouseId),
        }),
        fallback: tupleKey("fallback"),
      }),
    }),
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
