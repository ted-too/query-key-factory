import type { QueryClient, QueryKey } from "@tanstack/query-core";

/**
 * Tracks dependency -> dependent links so that when a dependency commits new
 * data, the dependents that consumed it can be invalidated. Keyed by TanStack
 * query hashes (the same hashing the client uses), so matching against cache
 * events is exact regardless of a custom `queryKeyHashFn`.
 */
class DependencyRegistry {
  private readonly dependents = new Map<string, Map<string, QueryKey>>();

  link(dependencyHash: string, dependentHash: string, dependentKey: QueryKey) {
    let entry = this.dependents.get(dependencyHash);
    if (entry === undefined) {
      entry = new Map();
      this.dependents.set(dependencyHash, entry);
    }
    entry.set(dependentHash, dependentKey);
  }

  dependentsOf(dependencyHash: string): QueryKey[] {
    const entry = this.dependents.get(dependencyHash);
    return entry === undefined ? [] : [...entry.values()];
  }

  forget(queryHash: string) {
    this.dependents.delete(queryHash);
    for (const entry of this.dependents.values()) {
      entry.delete(queryHash);
    }
  }
}

const registries = new WeakMap<QueryClient, DependencyRegistry>();

/**
 * Lazily installs a single QueryCache subscriber on the client (idempotent),
 * returning the per-client registry. When a dependency commits new data (a
 * `success` action) every dependent that consumed it is invalidated, which
 * refetches the active ones against the now-fresh dependency data.
 *
 * This is what makes `dependsOn` reactive without any explicit wiring: the
 * first dependent query to run installs it via `ctx.client`. Cascading on
 * `success` (rather than `invalidate`) guarantees the dependent re-runs against
 * fresh dependency data and avoids a double fetch. Cycles are not supported.
 */
export function ensureDependencyReactivity(
  client: QueryClient
): DependencyRegistry {
  const existing = registries.get(client);
  if (existing !== undefined) {
    return existing;
  }

  const registry = new DependencyRegistry();
  registries.set(client, registry);

  client.getQueryCache().subscribe((event) => {
    if (event.type === "removed") {
      registry.forget(event.query.queryHash);
      return;
    }

    if (event.type !== "updated" || event.action.type !== "success") {
      return;
    }

    for (const dependentKey of registry.dependentsOf(event.query.queryHash)) {
      client.invalidateQueries({ queryKey: dependentKey, exact: true });
    }
  });

  return registry;
}

/** Hash a query key using the client's own (possibly customized) hashing. */
export function queryHashForKey(
  client: QueryClient,
  queryKey: QueryKey
): string {
  return client.defaultQueryOptions({ queryKey }).queryHash;
}
