import type {
  QueryStoreFromSchema,
  QueryStoreSchema,
} from "../types/query-store";
import { createQueryKeys } from "./create-query-keys";
import { mergeQueryKeys } from "./merge-query-keys";

export function createQueryKeyStore<const StoreSchema extends QueryStoreSchema>(
  schema: StoreSchema & QueryStoreSchema
): QueryStoreFromSchema<StoreSchema> {
  const queryStores = Object.entries(schema).map(([key, factory]) =>
    factory ? createQueryKeys(key, factory) : createQueryKeys(key)
  );

  return mergeQueryKeys(...queryStores) as QueryStoreFromSchema<StoreSchema>;
}
