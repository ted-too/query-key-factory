---
"@ted-too/query-key-factory": patch
---

Fix nested query builder typing so nested `queryFn` callbacks keep the same TanStack Query context types as their parent query instead of falling back to `any`.
