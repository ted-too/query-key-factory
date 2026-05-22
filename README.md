# Query Key Factory

Typesafe TanStack Query factories built around a small DSL.

## Install

```bash
npm install @ted-too/query-key-factory
```

This package targets TanStack Query v5+.

## Quick Start

```ts
import * as q from "@ted-too/query-key-factory/query";
```

Use `import * as q` if tree-shaking matters.

`q` is also available as a named export:

```ts
import { q } from "@ted-too/query-key-factory/query";
```

That form is supported for convenience, but it goes through the exported `q` object.
Some bundlers may still optimize it, but you should not rely on `import { q }` for tree-shaking.
If tree-shaking matters, prefer `import * as q` instead of `import { q }`.

```ts
import * as q from "@ted-too/query-key-factory/query";

export const session = q.createQueryKeys("session", {
  me: q.static({
    queryFn: async ({ signal }) => {
      const client = createClient();
      const { data, error } = await client.getSession({
        fetchOptions: { signal },
      });

      if (error) {
        return Promise.reject(error);
      }

      return data;
    },
    staleTime: 60_000,
    organizationBySlug: q.dynamic((organizationSlug: string) => ({
      queryKey: ["organization", organizationSlug],
      queryFn: async ({ signal }) => {
        const client = createClient();
        const { data, error } =
          await client.organization.getFullOrganization({
            query: { organizationSlug },
            fetchOptions: { signal },
          });

        if (error) {
          return Promise.reject(error);
        }

        return data;
      },
      membership: q.static({
        queryKey: null,
        queryFn: async ({ signal }) => {
          const client = createClient();
          const { data, error } =
            await client.organization.getActiveMember({
              query: { organizationSlug },
              fetchOptions: { signal },
            });

          if (error) {
            return Promise.reject(error);
          }

          return data;
        },
      }),
    })),
  }),
});
```

Use it directly with TanStack Query:

```ts
useQuery(session.me);
useQuery(session.me.organizationBySlug("acme"));
useQuery(session.me.organizationBySlug("acme").membership);
```

## The DSL

### `q.static(...)`

Defines a query node that does not need arguments.

The object can contain:

- TanStack query options such as `queryFn`, `staleTime`, `gcTime`, `meta`, `select`, `enabled`, and `refetchOnWindowFocus`
- `queryKey`, which appends extra segments after the computed path
- Nested child nodes created with `q.static(...)` or `q.dynamic(...)`

`q.static({})` (empty body) is rejected at both the type level and at runtime — every node must contribute at least one of: `queryFn`, `queryKey`, or a nested child.

```ts
const account = q.createQueryKeys("account", {
  profile: q.static({
    queryFn: ({ signal }) => fetchProfile({ signal }),
    staleTime: 30_000,
  }),
});
```

If you want to use only the computed path for a node, use `queryKey: null`. `queryKey: undefined` and omitting `queryKey` entirely both behave the same way.

```ts
const account = q.createQueryKeys("account", {
  profile: q.static({
    queryKey: null,
    queryFn: ({ signal }) => fetchProfile({ signal }),
  }),
});
```

A `q.static(...)` may also have only nested children — useful when you want a parent purely as a namespace scope for invalidation:

```ts
const users = q.createQueryKeys("users", {
  me: q.static({
    sessions: q.static({
      queryFn: ({ signal }) => fetchSessions({ signal }),
    }),
  }),
});

// users.me.queryKey === ["users", "me"]
// users.me.sessions.queryKey === ["users", "me", "sessions"]
```

### `q.dynamic(...)`

Defines a query node that takes arguments and returns a plain object describing
the resolved query. The body has exactly the same shape `q.static(...)` accepts -
no inner wrapper needed.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) => ({
    queryKey: [sku],
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
  })),
});
```

This gives you:

```ts
products.detail.queryKey;
// ["products", "detail"]

products.detail("sku_123").queryKey;
// ["products", "detail", "sku_123"]
```

### Infinite queries

`q.static(...)` also covers `useInfiniteQuery`. When the definition includes
`initialPageParam` (and the matching `getNextPageParam`), the node is treated as
an infinite query: `pageParam` is inferred from `initialPageParam`, and
`lastPage` / `allPages` are inferred from `queryFn`'s return type.

```ts
const posts = q.createQueryKeys("posts", {
  feed: q.static({
    queryFn: ({ pageParam, signal }) =>
      fetchFeed({ cursor: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage) => firstPage.prevCursor,
    staleTime: 60_000,
  }),
});

useInfiniteQuery(posts.feed);
```

Inline nested children are not supported on infinite definitions (TypeScript
can't preserve full `pageParam` / data inference when the literal also contains
arbitrary nested definitions). Place sibling children alongside the infinite
node, or wrap the infinite node in a parent `q.static(...)` definition instead.

For parameterized infinite lists, wrap the body of the `q.dynamic(...)` factory
with `q.static(...)` so the strong infinite-query inference is preserved:

```ts
const posts = q.createQueryKeys("posts", {
  byAuthor: q.dynamic((authorId: string) =>
    q.static({
      queryKey: [authorId],
      queryFn: ({ pageParam, signal }) =>
        fetchAuthorFeed(authorId, { cursor: pageParam, signal }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })
  ),
});

useInfiniteQuery(posts.byAuthor("alice"));
```

Returning a plain object from `q.dynamic(...)` is still supported for infinite
queries, but `pageParam` / `lastPage` won't be inferred automatically -
annotate those parameters explicitly, or use the wrapped form above to recover
full inference.

## Reading The Output

Every node — scope container, materialised query, or dynamic callback — exposes a single `queryKey` property. For materialised query nodes it is the concrete cache key. For scope containers and dynamic callbacks it is the *base* path of that branch, which is exactly what TanStack's prefix-matching invalidation expects.

```ts
session.queryKey;
// ["session"]                                            (scope container)

session.me.queryKey;
// ["session", "me"]                                      (materialised static node)

session.me.organizationBySlug.queryKey;
// ["session", "me", "organizationBySlug"]                (dynamic callback — base path)

session.me.organizationBySlug("acme").queryKey;
// ["session", "me", "organizationBySlug", "organization", "acme"]
//                                                          (dynamic result — full path)
```

The property path is always included automatically.

Use the base path with TanStack's prefix invalidation to clear every variant of a dynamic branch:

```ts
// Invalidate every variant of `organizationBySlug`:
queryClient.invalidateQueries({
  queryKey: session.me.organizationBySlug.queryKey,
});
```

If you add `queryKey` to a `q.static` / `q.dynamic` body, those values are appended after the path.

## Nested Queries

Nested queries live directly beside the query options for that node.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) => ({
    queryKey: [sku],
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    recommended: q.dynamic((region: string) => ({
      queryKey: [region],
      queryFn: ({ signal }) =>
        fetchRecommendedProducts(sku, region, { signal }),
    })),
  })),
});
```

That gives you:

```ts
products.detail("sku_123").recommended("us").queryKey;
```

## Tuple Inference

Use `q.tupleKey(...)` when you want exact tuple inference through deeper nesting.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) => ({
    queryKey: q.tupleKey(sku),
    recommended: q.dynamic((region: string) => ({
      queryKey: q.tupleKey(region),
    })),
  })),
});
```

## Building A Store

Use `q.createQueryKeyStore(...)` when you want multiple top-level features in one declaration.

```ts
export const queries = q.createQueryKeyStore({
  products: {
    detail: q.dynamic((sku: string) => ({
      queryKey: [sku],
      queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    })),
  },
  collections: {
    bySlug: q.dynamic((slug: string) => ({
      queryKey: [slug],
      queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
    })),
  },
});
```

## Merging Features

Use `q.mergeQueryKeys(...)` to compose separately declared features.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) => ({
    queryKey: [sku],
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
  })),
});

const collections = q.createQueryKeys("collections", {
  bySlug: q.dynamic((slug: string) => ({
    queryKey: [slug],
    queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
  })),
});

const catalog = q.mergeQueryKeys(products, collections);
```

When two units share the same top-level scope (e.g. both are `q.createQueryKeys("todos", ...)`), they are **deep-merged**: non-overlapping inner properties are combined into one scope. If two units try to define the same leaf (a `q.static` / `q.dynamic` node at the same path), `q.mergeQueryKeys` **throws** rather than silently picking one. Rename the colliding leaf or move it under a different scope.

You can also create a namespaced unit that can be merged again later:

```ts
const catalog = q.mergeQueryKeys("catalog", products, collections);
```

## Type Helpers

```ts
import type {
  QueryStore,
  QueryStoreUnit,
  ResolveQueryData,
} from "@ted-too/query-key-factory/query";
```

Examples:

```ts
type SessionUnit = typeof session;
type SessionData = ResolveQueryData<typeof session.me>;
type OrganizationData = ResolveQueryData<
  ReturnType<typeof session.me.organizationBySlug>
>;
```

`ResolveQueryData` works best with concrete nodes. For dynamic nodes, pass `ReturnType<typeof yourFactory>`.

For typing override objects, options bags, or function parameters, use the node's own type directly:

```ts
// Full options shape (already extends UseQueryOptions):
type MeOptions = typeof session.me;

// Override shape for a custom hook:
type MeOverrides = Partial<typeof session.me>;

// Same thing for a dynamic node \u2014 take the call's ReturnType:
type OrgOptions = ReturnType<typeof session.me.organizationBySlug>;
```

## API

### `q.createQueryKeys(key, schema)`

Creates one feature-level query factory.

### `q.createQueryKeyStore(schema)`

Creates a store with multiple top-level features.

### `q.mergeQueryKeys(...schemas)`

Merges multiple feature factories into one store.

### `q.mergeQueryKeys(namespace, ...schemas)`

Creates a namespaced feature factory that can be merged later.

### `q.static(definition)`

Creates a query node. If the definition includes `initialPageParam` (and the
matching `getNextPageParam`) the node is treated as an infinite query suitable
for `useInfiniteQuery`; otherwise it is a standard query suitable for
`useQuery`.

### `q.dynamic(factory)`

Creates a parameterized query node. The factory body has the same shape
`q.static(...)` accepts. For full inference of infinite queries inside a
dynamic factory, wrap the body in `q.static(...)`.

### `q.tupleKey(...values)`

Builds a tuple-typed query key suffix.

## Current Scope

This package is focused on query factories.

The `q` namespace is meant to leave room for future namespaces such as mutations without changing the overall mental model.

## Credits

- Original package and concept: [`@lukemorales/query-key-factory`](https://github.com/lukemorales/query-key-factory)
- This fork lives at [github.com/ted-too/query-key-factory](https://github.com/ted-too/query-key-factory)
