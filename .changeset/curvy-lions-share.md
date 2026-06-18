---
"@ted-too/query-key-factory": patch
---

Surface TanStack query options (`enabled`, `staleTime`, `gcTime`, …) on dependent `q.static` / `q.dynamic` nodes. They are now suggested in editor autocomplete and value-checked at the call site (e.g. `enabled: "nope"` is rejected) instead of being silently accepted as untyped extra keys. Authored options still materialise only the fields you set — the node stays free of the phantom option bag — so it remains assignable to stricter consumers such as `@tanstack/vue-query`'s `useQuery`.
