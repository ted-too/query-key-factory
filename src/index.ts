/** biome-ignore-all lint/performance/noBarrelFile: this is needed for the build process */
export { createQueryKeyStore } from "./lib/create-query-key-store";
export { createQueryKeys } from "./lib/create-query-keys";
export { mergeQueryKeys } from "./lib/merge-query-keys";
export { tupleKey } from "./lib/tuple-key";

export type {
  QueryStore,
  QueryStoreSchema,
  QueryStoreUnit,
} from "./types/query-store";
export type {
  ResolveQueryData,
  TypedUseQueryOptions,
} from "./types/resolve";
