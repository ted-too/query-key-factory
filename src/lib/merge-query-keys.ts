import { omitPrototype } from "../internals/omit-prototype";
import type {
  AnyQueryStoreUnit,
  QueryStore,
  QueryStoreUnit,
} from "../types/query-store";

type QueryStoreEntriesFromUnits<QueryStoreUnits extends AnyQueryStoreUnit[]> =
  QueryStoreUnits extends [
    infer First extends AnyQueryStoreUnit,
    ...infer Rest extends AnyQueryStoreUnit[],
  ]
    ? {
        [P in First["queryKey"][0]]: First;
      } & QueryStoreEntriesFromUnits<Rest>
    : {};

/**
 * A node is a "leaf" (a materialised query target) when:
 *   - it is a function (the `q.dynamic` callback), or
 *   - it carries a `queryFn` (a materialised static / infinite node).
 *
 * Everything else with a `queryKey` is a structural scope and may be deep-
 * merged. Namespace-only nodes (`q.static({ children })`) have no `queryFn`
 * and are treated as scopes so their children can combine.
 */
const isLeaf = (value: unknown): boolean => {
  if (typeof value === "function") {
    return true;
  }
  if (value !== null && typeof value === "object") {
    return "queryFn" in value;
  }
  return false;
};

const isPlainScope = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !isLeaf(value);

const areArraysEqual = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const deepMergeScopes = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  path: readonly string[]
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    if (!(key in result)) {
      result[key] = sourceValue;
      continue;
    }

    const targetValue = result[key];

    if (key === "queryKey") {
      if (
        !(
          Array.isArray(targetValue) &&
          Array.isArray(sourceValue) &&
          areArraysEqual(targetValue, sourceValue)
        )
      ) {
        throw new Error(
          `q.mergeQueryKeys: incompatible "queryKey" at ${[...path].join(".") || "<root>"}`
        );
      }
      continue;
    }

    if (isPlainScope(targetValue) && isPlainScope(sourceValue)) {
      result[key] = deepMergeScopes(targetValue, sourceValue, [...path, key]);
      continue;
    }

    throw new Error(
      `q.mergeQueryKeys: leaf collision at "${[...path, key].join(".")}" \u2014 ` +
        "two definitions target the same node. Rename one of them, or move it under a different scope."
    );
  }

  return result;
};

export function mergeQueryKeys<
  Key extends string,
  QueryStoreUnits extends AnyQueryStoreUnit[],
>(
  key: Key,
  ...schemas: QueryStoreUnits
): QueryStoreUnit<Key, QueryStoreEntriesFromUnits<QueryStoreUnits>>;

export function mergeQueryKeys<QueryStoreUnits extends AnyQueryStoreUnit[]>(
  ...schemas: QueryStoreUnits
): QueryStore<QueryStoreEntriesFromUnits<QueryStoreUnits>>;

export function mergeQueryKeys(...args: unknown[]): unknown {
  const isNamed = typeof args[0] === "string";
  const key = isNamed ? (args[0] as string) : undefined;
  const schemas = (isNamed ? args.slice(1) : args) as AnyQueryStoreUnit[];

  const store = schemas.reduce<Map<string, Record<string, unknown>>>(
    (storeMap, current) => {
      const [storeKey] = current.queryKey;
      const existing = storeMap.get(storeKey);
      const incoming = current as unknown as Record<string, unknown>;

      storeMap.set(
        storeKey,
        existing == null
          ? { ...incoming }
          : deepMergeScopes(existing, incoming, [storeKey])
      );
      return storeMap;
    },
    new Map<string, Record<string, unknown>>()
  );

  const result = omitPrototype(Object.fromEntries(store));

  if (key != null) {
    return omitPrototype({
      queryKey: [key] as const,
      ...result,
    });
  }

  return result;
}
