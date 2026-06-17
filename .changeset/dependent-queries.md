---
"@ted-too/query-key-factory": minor
---

Add reactive dependent queries via a `dependsOn` map on `q.static` nodes.

- **`dependsOn` on `q.static` (and infinite) nodes.** Declare a map of dependencies that are loaded before the node's own `queryFn` runs; the resolved data is handed to `queryFn` as a second argument, keyed by the same names. Dependencies load in parallel via `queryClient.ensureQueryData` (using the `client` on TanStack's `QueryFunctionContext`), so no `queryClient` is threaded through call sites and it works the same during SSR / prefetching.
- **Two ways to declare a dependency.** Reference an existing node (`dependsOn: { countries: reference.countries }` or `products.detail(sku)` for a dynamic node) to reuse its canonical cache entry, or pass an inline `q.static({...})` escape hatch that gets its own derived key under the parent node (`["session", "me", "countries"]`).
- **Reactive without hooks or wiring.** When a dependency commits new data — refetch, invalidation, or `setQueryData` — every dependent that consumed it is automatically invalidated, so active observers refetch against fresh data. The first dependent to run installs a single idempotent `QueryCache` subscriber via its `QueryFunctionContext`; the design stays framework-agnostic. Cascading happens on the dependency's `success` (not merely on `invalidate`) to avoid a double fetch. Cycles are not supported.
- **Resolved `dependsOn` map exposed on the node.** Reach each dependency's `queryKey` for manual invalidation via `node.dependsOn.<name>.queryKey` (e.g. `session.me.dependsOn.countries.queryKey`), which is especially useful for inline dependencies whose key lives under the parent node.
- **Dynamic and infinite dependents.** Parameterized dependents work by wrapping the `q.dynamic(...)` body in `q.static(...)` (`q.dynamic((id) => q.static({ dependsOn, queryFn }))`); infinite queries can declare `dependsOn` too, with `pageParam`, the page type, and the resolved dependencies all inferred — declare `queryFn` before `getNextPageParam` so the page type is inferred from `queryFn`'s return.
