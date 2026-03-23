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
        [P in First["_def"][0]]: First;
      } & QueryStoreEntriesFromUnits<Rest>
    : {};

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

  const store = schemas.reduce((storeMap, current) => {
    const [storeKey] = current._def;

    storeMap.set(storeKey, { ...storeMap.get(storeKey), ...current });
    return storeMap;
  }, new Map());

  const result = omitPrototype(Object.fromEntries(store));

  if (key != null) {
    return omitPrototype({
      _def: [key] as const,
      ...result,
    });
  }

  return result;
}
