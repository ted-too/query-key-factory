# Query Key Factory

Typesafe query key management for TanStack Query, with support for composing feature stores into larger domain stores.

This package started as a fork inspired by [`@lukemorales/query-key-factory`](https://github.com/lukemorales/query-key-factory). It keeps the original library's core ergonomics while extending the merge story so you can group and re-group query factories into nested domains.

## Install

```bash
npm install @ted-too/query-key-factory
```

This package is designed for TanStack Query v5 and above.

## What this library gives you

- One place to define query keys and query functions
- Fully typed query keys
- Reusable `_def` scopes for invalidation and grouping
- Feature-level query factories that can be merged into larger domain stores
- Inline nested child queries when a query only makes sense in the context of another query

## Core ideas

### `QueryStoreUnit`

A `QueryStoreUnit` is one feature's query factory.

Example:

```ts
const products = createQueryKeys("products", {
  detail: (sku: string) => ({
    queryKey: [sku],
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
  }),
});
```

`products` is a `QueryStoreUnit`.

### `QueryStore`

A `QueryStore` is an object made of multiple `QueryStoreUnit`s.

Example:

```ts
const storeQueries = createQueryKeyStore({
  products: {
    detail: (sku: string) => [sku],
  },
});
```

`storeQueries` is a `QueryStore`.

In practice:

- `createQueryKeys()` creates a `QueryStoreUnit`
- `createQueryKeyStore()` creates a `QueryStore`
- `mergeQueryKeys()` composes `QueryStoreUnit`s into a `QueryStore`, or creates a namespaced `QueryStoreUnit` that can be merged again later

## A single example

The rest of this guide uses one small catalog example:

```ts
import {
  createQueryKeyStore,
  createQueryKeys,
  mergeQueryKeys,
  tupleKey,
} from "@ted-too/query-key-factory";
```

```ts
export const products = createQueryKeys("products", {
  detail: (sku: string) => ({
    queryKey: tupleKey(sku),
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
  }),
});
```

## Reading the generated API

### `._def` vs `.queryKey`

`._def` is the stable scope for a factory node.

`.queryKey` is the full cache key for a concrete query.

```ts
products._def;
// ["products"]

products.detail._def;
// ["products", "detail"]

products.detail("sku_123").queryKey;
// ["products", "detail", "sku_123"]
```

Use `._def` when you want to refer to a branch.

Use `.queryKey` when you want one exact query instance.

The property name is always part of the computed key path.

`queryKey` adds extra suffix segments after that path.

For example:

```ts
const session = createQueryKeys("session", {
  me: {
    queryFn: ({ signal }) => fetchSession({ signal }),
  },
  detail: (sessionId: number) => ({
    queryKey: [sessionId, { include: "user" }],
    queryFn: ({ signal }) =>
      fetchSessionDetail(sessionId, { include: "user", signal }),
  }),
});
```

```ts
session.me.queryKey;
// ["session", "me"]

session.detail(1).queryKey;
// ["session", "detail", 1, { include: "user" }]
```

For static object entries, `queryKey` is optional.

Omitting it is the same as saying "use only the computed path for this entry".

Query key suffix segments can be strings, numbers, booleans, objects, or other serializable values supported by TanStack Query.

## Using it with TanStack Query

```ts
import { useQuery } from "@tanstack/react-query";

export function useProductDetail(sku: string) {
  return useQuery(products.detail(sku));
}
```

## Inline nested child queries

Child queries are declared directly on the factory result object.

```ts
const products = createQueryKeys("products", {
  detail: (sku: string) => ({
    queryKey: [sku],
    queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    recommended: (region: string) => ({
      queryKey: [region],
      queryFn: ({ signal }) =>
        fetchRecommendedProducts(sku, region, { signal }),
    }),
  }),
});
```

That gives you:

```ts
products.detail("sku_123").recommended("us").queryKey;
```

This is useful when a child query only makes sense in the context of its parent.

## Merging feature units

The preferred approach is to define features independently and merge them later.

```ts
export const collections = createQueryKeys("collections", {
  bySlug: (slug: string) => ({
    queryKey: tupleKey(slug),
    queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
  }),
});

export const catalog = mergeQueryKeys(products, collections);
```

This creates a `QueryStore`:

```ts
catalog.products.detail("sku_123").queryKey;
catalog.collections.bySlug("summer-sale").queryKey;
```

## Building a store in one file

If you do not want to split features into separate files and merge them, use `createQueryKeyStore()` instead:

```ts
export const storeQueries = createQueryKeyStore({
  products: {
    detail: (sku: string) => ({
      queryKey: tupleKey(sku),
      queryFn: ({ signal }) => fetchProductBySku(sku, { signal }),
    }),
  },
  collections: {
    bySlug: (slug: string) => ({
      queryKey: tupleKey(slug),
      queryFn: ({ signal }) => fetchCollectionBySlug(slug, { signal }),
    }),
  },
});
```

This also creates a `QueryStore`:

```ts
storeQueries.products.detail("sku_123").queryKey;
storeQueries.collections.bySlug("summer-sale").queryKey;
```

## Namespaced merges

You can also create a named group:

```ts
export const catalog = mergeQueryKeys("catalog", products, collections);
```

This creates a namespaced `QueryStoreUnit`, so it can be merged again later.

```ts
catalog._def;
// ["catalog"]

catalog.products.detail("sku_123").queryKey;
```

Then later:

```ts
export const mergedQueries = mergeQueryKeys(account, catalog);
```

Now:

```ts
mergedQueries.account.profile.queryKey;
mergedQueries.catalog.products.detail("sku_123").queryKey;
```

## `tupleKey(...)`

You can always write `queryKey: [value]`.

If you want deeper nested tuple inference to stay exact, use `tupleKey(...)`:

```ts
const products = createQueryKeys("products", {
  detail: (sku: string) => ({
    queryKey: tupleKey(sku),
    recommended: (region: string) => ({
      queryKey: tupleKey(region),
    }),
  }),
});
```

This is especially useful when you want precise inferred types several levels deep.

## Types

```ts
import type {
  QueryStore,
  QueryStoreUnit,
  ResolveQueryData,
  TypedUseQueryOptions,
} from "@ted-too/query-key-factory";
```

Using the example declarations above:

```ts
type ProductsUnit = typeof products; // QueryStoreUnit
type MergedQueries = typeof mergedQueries; // QueryStore
type StoreQueries = typeof storeQueries; // QueryStore

// From a merged QueryStore
// You could also do: ResolveQueryData<typeof products.detail>
type ProductDetailData = ResolveQueryData<typeof mergedQueries.products.detail>;

// From a nested child query on a merged QueryStore
// You could also do: ResolveQueryData<ReturnType<typeof products.detail>["recommended"]>
type RecommendedData = ResolveQueryData<
  ReturnType<typeof mergedQueries.products.detail>["recommended"]
>;

type ProductDetailOptions = TypedUseQueryOptions<
  typeof mergedQueries.products.detail
>;
type RecommendedOptions = TypedUseQueryOptions<
  ReturnType<typeof mergedQueries.products.detail>["recommended"]
>;
```

What these helpers are for:

- `ResolveQueryData<typeof mergedQueries.products.detail>` gives you the resolved data type from that query unit's `queryFn`
- `ResolveQueryData<ReturnType<typeof mergedQueries.products.detail>["recommended"]>` gives you the resolved data type for a nested child query unit
- `TypedUseQueryOptions<typeof mergedQueries.products.detail>` gives you correctly typed TanStack Query options for that unit

## Current scope

This package is currently focused on query key factories.

Mutation key support has been intentionally removed for now while it is redesigned, and will come back in a future release.

## API

### `createQueryKeys(key, schema)`

Creates a `QueryStoreUnit` for one feature.

### `createQueryKeyStore(schema)`

Creates a `QueryStore` from an object of feature schemas declared in one place.

### `mergeQueryKeys(...schemas)`

Merges `QueryStoreUnit`s into a `QueryStore`.

### `mergeQueryKeys(namespace, ...schemas)`

Creates a named `QueryStoreUnit` with its own `_def`, which can be merged again later.

### `tupleKey(...values)`

Builds a tuple-typed query key segment list when you want deeper nested key inference to stay exact.

## Credits

- Original package and concept: [`@lukemorales/query-key-factory`](https://github.com/lukemorales/query-key-factory)
- This package is a fork/adaptation built for additional composition needs, and its source will live at [github.com/ted-too/query-key-factory](https://github.com/ted-too/query-key-factory)
