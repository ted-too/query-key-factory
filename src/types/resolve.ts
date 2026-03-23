import type { QueryFunction, UseQueryOptions } from "@tanstack/react-query";
import type { AnyMutableOrReadonlyArray } from "./core";
import type {
  AnyDynamicQueryStoreUnit,
  AnyQueryStoreUnit,
  AnyStaticQueryStoreEntry,
} from "./query-store";

type MergeInsertions<T> = T extends object
  ? { [K in keyof T]: MergeInsertions<T[K]> }
  : T;

type ResolveQueryStoreEntryRecord<Target extends object> = {
  [P in Exclude<
    keyof Target,
    "queryFn"
  >]: Target[P] extends AnyMutableOrReadonlyArray
    ? Target[P]
    : Target[P] extends object
      ? {
          [K in keyof Target[P]]: ResolveQueryStoreProperty<Target[P][K]>;
        }
      : never;
};

type ResolveQueryStoreRecord<Target extends object> = {
  [P in keyof Target]: MergeInsertions<ResolveQueryStoreProperty<Target[P]>>;
};

type ResolveQueryStoreProperty<Value> = Value extends AnyMutableOrReadonlyArray
  ? Value
  : Value extends AnyStaticQueryStoreEntry
    ? ResolveQueryStoreEntryRecord<Value>
    : Value extends AnyDynamicQueryStoreUnit
      ? Record<"_def", Value["_def"]> &
          ResolveQueryStoreEntryRecord<ReturnType<Value>>
      : Value extends object
        ? ResolveQueryStoreRecord<Value>
        : never;

export type ResolveQueryStoreUnit<StoreUnit extends AnyQueryStoreUnit> =
  ResolveQueryStoreRecord<StoreUnit>;

export type ResolveQueryStore<Store extends Record<string, unknown>> =
  ResolveQueryStoreRecord<Store>;

interface LooseQueryOptionsStruct {
  queryFn: QueryFunction<unknown, AnyMutableOrReadonlyArray>;
  queryKey: AnyMutableOrReadonlyArray;
}

export type ResolveQueryData<QueryUnit> =
  QueryUnit extends AnyDynamicQueryStoreUnit
    ? ResolveQueryData<ReturnType<QueryUnit>>
    : QueryUnit extends {
          queryFn: (...args: infer _Args) => infer Result;
        }
      ? Awaited<Result>
      : never;

type LooseQueryOptionsStructGenerator = (
  ...args: readonly unknown[]
) => LooseQueryOptionsStruct;

export type TypedUseQueryOptions<
  Options extends LooseQueryOptionsStruct | LooseQueryOptionsStructGenerator,
  Data = Options extends LooseQueryOptionsStructGenerator
    ? Awaited<ReturnType<ReturnType<Options>["queryFn"]>>
    : Options extends LooseQueryOptionsStruct
      ? Awaited<ReturnType<Options["queryFn"]>>
      : never,
> = Options extends LooseQueryOptionsStructGenerator
  ? UseQueryOptions<
      Awaited<ReturnType<ReturnType<Options>["queryFn"]>>,
      unknown,
      Data,
      ReturnType<Options>["queryKey"]
    >
  : Options extends LooseQueryOptionsStruct
    ? UseQueryOptions<
        Awaited<ReturnType<Options["queryFn"]>>,
        unknown,
        Data,
        Options["queryKey"]
      >
    : never;
