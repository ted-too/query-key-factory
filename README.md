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
- `dependsOn`, a map of dependencies to prefetch before `queryFn` runs (see [Dependent Queries](#dependent-queries))

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

### Dependent Queries

A `q.static(...)` node can declare a `dependsOn` map. Each dependency is loaded
before the node's own `queryFn` runs, and the resolved data is passed to
`queryFn` as a second argument, keyed by the same names.

```ts
import * as q from "@ted-too/query-key-factory/query";

const reference = q.createQueryKeys("reference", {
  countries: q.static({
    queryFn: ({ signal }) => fetchCountries({ signal }),
  }),
});

export const session = q.createQueryKeys("session", {
  me: q.static({
    dependsOn: {
      // Reference an existing node to reuse its cache entry.
      countries: reference.countries,
    },
    queryFn: async ({ signal }, { countries }) => {
      // `countries` is typed as the resolved data of `reference.countries`.
      const { data, error } = await getSession({ countries, signal });
      if (error) {
        return Promise.reject(error);
      }
      return data;
    },
    staleTime: 60_000,
  }),
});
```

`session.me` is still a normal query node — use it directly:

```ts
useQuery(session.me);
```

Under the hood the emitted `queryFn` loads every dependency in parallel via
`queryClient.ensureQueryData` (using the `client` on TanStack's
`QueryFunctionContext`) and then calls your `queryFn` with the results. No
`queryClient` needs to be threaded through your call sites, and it works the
same way during SSR / prefetching. Because the dependencies don't depend on each
other, they run in parallel, flattening the request waterfall to a single level
(dependencies, then the node).

Dependencies can be declared two ways:

- **A reference to a node** — `reference.countries`, or `products.detail("sku_123")`
  for a dynamic node. This reuses that node's canonical cache entry.
- **An inline definition** (escape hatch) — `q.static({ queryFn: ... })`. Inline
  dependencies get their own derived cache key under the parent node
  (`["session", "me", "countries"]` below) and therefore do **not** share a
  cache entry with any canonical query declared elsewhere.

```ts
const session = q.createQueryKeys("session", {
  me: q.static({
    dependsOn: {
      countries: q.static({
        queryFn: ({ signal }) => fetchCountries({ signal }),
      }),
    },
    queryFn: async ({ signal }, { countries }) => fetchSession(countries, { signal }),
  }),
});
```

### Reactivity

Unlike a plain one-shot prefetch, `dependsOn` is **reactive**: when a dependency
commits new data because it refetched, was invalidated, or had its data set
directly every dependent that consumed it is automatically invalidated, so any
active observer refetches against the fresh dependency data.

```ts
// Re-runs `session.me` (if observed) against the new countries:
queryClient.invalidateQueries({ queryKey: reference.countries.queryKey });
queryClient.setQueryData(reference.countries.queryKey, ["US", "GB"]);
```

> [!NOTE]
> The node still exposes a single status: if a dependency rejects, the node rejects.
> Dependency cycles are not supported.

### Inspecting and invalidating dependencies

The resolved `dependsOn` map is exposed on the node, so you can reach each
dependency's `queryKey` for manual invalidation, this is useful for inline
dependencies, whose derived key lives under the parent node:

```ts
session.me.dependsOn.countries.queryKey;
// ["reference", "countries"]  (reference) — or, for an inline dependency:
// ["session", "me", "countries"]

queryClient.invalidateQueries({
  queryKey: session.me.dependsOn.countries.queryKey,
});
```

### Dynamic and infinite dependents

A parameterized dependent is just a plain `q.dynamic(...)` factory body with a
`dependsOn` map. The factory argument, the resolved dependencies, and any options are all inferred:

```ts
const posts = q.createQueryKeys("posts", {
  byAuthor: q.dynamic((userId: string) => ({
    queryKey: [userId],
    dependsOn: { author: users.detail(userId) },
    staleTime: 60_000,
    queryFn: (_ctx, { author }) => fetchPostsByAuthor(author.id),
  })),
});

posts.byAuthor("user_1").dependsOn.author.queryKey;
// ["users", "detail", "user_1"]
```

Infinite queries can also declare `dependsOn`; the page param and the resolved dependencies are inferred, both for fixed nodes and dynamic factories:

```ts
const feed = q.createQueryKeys("feed", {
  posts: q.static({
    dependsOn: { settings: settings.feed },
    initialPageParam: 0,
    queryFn: ({ pageParam }, { settings }) =>
      fetchFeed({ cursor: pageParam, pageSize: settings.pageSize }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }),
});

const topicFeed = q.createQueryKeys("topicFeed", {
  byTopic: q.dynamic((topic: string) => ({
    queryKey: [topic],
    dependsOn: { settings: settings.feed },
    initialPageParam: 0,
    queryFn: ({ pageParam }, { settings }) =>
      fetchTopicFeed(topic, { cursor: pageParam, pageSize: settings.pageSize }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })),
});

useInfiniteQuery(feed.posts);
useInfiniteQuery(topicFeed.byTopic("typescript"));
```

Like infinite queries, dependent definitions don't support inline nested
children thus place siblings alongside the node or wrap it in a parent scope.

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
`useQuery`. If the definition includes a `dependsOn` map, the node prefetches
those dependencies (via `queryClient.ensureQueryData`) and passes their resolved
data to `queryFn` as a second argument. See [Dependent Queries](#dependent-queries).

### `q.dynamic(factory)`

Creates a parameterized query node. The factory body has the same shape
`q.static(...)` accepts — including `dependsOn` maps — so dependent dynamic
nodes need no `q.static(...)` wrapper. For the strongest `pageParam` / `lastPage`
inference on an infinite dynamic node, wrap the body in `q.static(...)`.

### `q.tupleKey(...values)`

Builds a tuple-typed query key suffix.

## Current Scope

This package is focused on query factories.

The `q` namespace is meant to leave room for future namespaces such as mutations without changing the overall mental model.

## Credits

- Original package and concept: [`@lukemorales/query-key-factory`](https://github.com/lukemorales/query-key-factory)
- This fork lives at [github.com/ted-too/query-key-factory](https://github.com/ted-too/query-key-factory)
