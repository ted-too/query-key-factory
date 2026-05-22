/** biome-ignore-all lint/performance/noBarrelFile: this is needed for the build process */
export type {
  QueryStore,
  QueryStoreSchema,
  QueryStoreUnit,
} from "../types/query-store";
export type { ResolveQueryData } from "../types/resolve";
export { createQueryKeyStore } from "./create-query-key-store";
export { createQueryKeys } from "./create-query-keys";
export { mergeQueryKeys } from "./merge-query-keys";
export {
  dynamicQuery as dynamic,
  staticQuery as static,
} from "./query-definition";
export { tupleKey } from "./tuple-key";

import { createQueryKeyStore } from "./create-query-key-store";
import { createQueryKeys } from "./create-query-keys";
import { mergeQueryKeys } from "./merge-query-keys";
import { dynamicQuery, staticQuery } from "./query-definition";
import { tupleKey } from "./tuple-key";

export const q = {
  createQueryKeyStore,
  createQueryKeys,
  mergeQueryKeys,
  tupleKey,
  static: staticQuery,
  dynamic: dynamicQuery,
} as const;
