---
"@ted-too/query-key-factory": minor
---

Redesign the query factory API around the new `q` DSL with `q.static`, `q.dynamic`, and a dedicated `@ted-too/query-key-factory/query` entrypoint. This fixes nested `queryFn` type inference, allows TanStack query option fields like `staleTime` and `gcTime` on query nodes, and updates the package docs and exports to match the new authoring model.
