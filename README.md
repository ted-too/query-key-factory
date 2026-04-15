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
    organizationBySlug: q.dynamic((organizationSlug: string) =>
      q.static({
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
      })
    ),
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

```ts
const account = q.createQueryKeys("account", {
  profile: q.static({
    queryFn: ({ signal }) => fetchProfile({ signal }),
    staleTime: 30_000,
  }),
});
```

If you want to use only the computed path for a node, use `queryKey: null`.

```ts
const account = q.createQueryKeys("account", {
  profile: q.static({
    queryKey: null,
    queryFn: ({ signal }) => fetchProfile({ signal }),
  }),
});
```

### `q.dynamic(...)`

Defines a query node that takes arguments and returns a `q.static(...)` node.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) =>
    q.static({
      queryKey: [sku],
      queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    })
  ),
});
```

This gives you:

```ts
products.detail._def;
// ["products", "detail"]

products.detail("sku_123").queryKey;
// ["products", "detail", "sku_123"]
```

## Reading The Output

Every generated branch gives you a stable scope and a concrete query key:

- `._def` is the branch scope
- `.queryKey` is the fully resolved key for that node

```ts
session._def;
// ["session"]

session.me.queryKey;
// ["session", "me"]

session.me.organizationBySlug._def;
// ["session", "me", "organizationBySlug"]

session.me.organizationBySlug("acme").queryKey;
// ["session", "me", "organizationBySlug", "organization", "acme"]
```

The property path is always included automatically.

If you add `queryKey`, those values are appended after the path.

## Nested Queries

Nested queries live directly beside the query options for that node.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) =>
    q.static({
      queryKey: [sku],
      queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
      recommended: q.dynamic((region: string) =>
        q.static({
          queryKey: [region],
          queryFn: ({ signal }) =>
            fetchRecommendedProducts(sku, region, { signal }),
        })
      ),
    })
  ),
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
  detail: q.dynamic((sku: string) =>
    q.static({
      queryKey: q.tupleKey(sku),
      recommended: q.dynamic((region: string) =>
        q.static({
          queryKey: q.tupleKey(region),
        })
      ),
    })
  ),
});
```

## Building A Store

Use `q.createQueryKeyStore(...)` when you want multiple top-level features in one declaration.

```ts
export const queries = q.createQueryKeyStore({
  products: {
    detail: q.dynamic((sku: string) =>
      q.static({
        queryKey: [sku],
        queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
      })
    ),
  },
  collections: {
    bySlug: q.dynamic((slug: string) =>
      q.static({
        queryKey: [slug],
        queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
      })
    ),
  },
});
```

## Merging Features

Use `q.mergeQueryKeys(...)` to compose separately declared features.

```ts
const products = q.createQueryKeys("products", {
  detail: q.dynamic((sku: string) =>
    q.static({
      queryKey: [sku],
      queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    })
  ),
});

const collections = q.createQueryKeys("collections", {
  bySlug: q.dynamic((slug: string) =>
    q.static({
      queryKey: [slug],
      queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
    })
  ),
});

const catalog = q.mergeQueryKeys(products, collections);
```

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
  TypedUseQueryOptions,
} from "@ted-too/query-key-factory/query";
```

Examples:

```ts
type SessionUnit = typeof session;
type SessionData = ResolveQueryData<typeof session.me>;
type OrganizationData = ResolveQueryData<
  ReturnType<typeof session.me.organizationBySlug>
>;
type MembershipOptions = TypedUseQueryOptions<
  ReturnType<typeof session.me.organizationBySlug>["membership"]
>;
```

`ResolveQueryData` works best with concrete nodes. For dynamic nodes, pass `ReturnType<typeof yourFactory>`.

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

Creates a static query node.

### `q.dynamic(factory)`

Creates a parameterized query node.

### `q.tupleKey(...values)`

Builds a tuple-typed query key suffix.

## Current Scope

This package is focused on query factories.

The `q` namespace is meant to leave room for future namespaces such as mutations without changing the overall mental model.

## Credits

- Original package and concept: [`@lukemorales/query-key-factory`](https://github.com/lukemorales/query-key-factory)
- This fork lives at [github.com/ted-too/query-key-factory](https://github.com/ted-too/query-key-factory)
