import type { AnyMutationKeyFactoryResult } from "./create-mutation-keys.types";
import type { AnyQueryKeyFactoryResult } from "./create-query-keys.types";
import { omitPrototype } from "./internals";
import type { DefinitionKey, Prettify } from "./types";

type AnyKeyFactoryResult =
  | AnyQueryKeyFactoryResult
  | AnyMutationKeyFactoryResult;

type StoreFromMergedQueryKeys<
  QueryOrMutationKeyFactoryResults extends AnyKeyFactoryResult[],
> = QueryOrMutationKeyFactoryResults extends [
  infer First extends AnyKeyFactoryResult,
  ...infer Rest extends AnyKeyFactoryResult[],
]
  ? { [P in First["_def"][0]]: First } & StoreFromMergedQueryKeys<Rest>
  : {};

export function mergeQueryKeys<
  Key extends string,
  QueryKeyFactoryResults extends AnyKeyFactoryResult[],
>(
  key: Key,
  ...schemas: QueryKeyFactoryResults
): Prettify<
  DefinitionKey<[Key]> & StoreFromMergedQueryKeys<QueryKeyFactoryResults>
>;

export function mergeQueryKeys<
  QueryKeyFactoryResults extends AnyKeyFactoryResult[],
>(
  ...schemas: QueryKeyFactoryResults
): Prettify<StoreFromMergedQueryKeys<QueryKeyFactoryResults>>;

export function mergeQueryKeys(...args: unknown[]): unknown {
  const isNamed = typeof args[0] === "string";
  const key = isNamed ? (args[0] as string) : undefined;
  const schemas = (isNamed ? args.slice(1) : args) as AnyKeyFactoryResult[];

  const store = schemas.reduce((storeMap, current) => {
    const [storeKey] = current._def;

    storeMap.set(storeKey, { ...storeMap.get(storeKey), ...current });
    return storeMap;
  }, new Map());

  const result = omitPrototype(Object.fromEntries(store));

  if (key != null) {
    return omitPrototype({ _def: [key] as const, ...result });
  }

  return result;
}
