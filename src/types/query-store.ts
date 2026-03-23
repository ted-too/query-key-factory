import type { QueryFunction } from "@tanstack/query-core";
import type { ExtractInternalKeys, InternalKey } from "../internals/types";
import type {
  AnyMutableOrReadonlyArray,
  DefinitionKey,
  Prettify,
} from "./core";

export type AnyQueryKey = readonly [string, ...unknown[]];

type ReservedFactoryKey = "queryKey" | "queryFn";

interface StaticFactoryObjectSchema {
  queryFn?: QueryFunction;
  queryKey: AnyMutableOrReadonlyArray | null;
  [key: string]: unknown;
}

interface DynamicFactoryObjectSchema {
  queryFn?: QueryFunction;
  queryKey: AnyMutableOrReadonlyArray;
  [key: string]: unknown;
}

type FactoryProperty =
  | null
  | AnyMutableOrReadonlyArray
  | StaticFactoryObjectSchema;

type DynamicKey = (
  ...args: readonly never[]
) => DynamicFactoryObjectSchema | AnyMutableOrReadonlyArray;

export type QueryFactorySchema = Record<string, FactoryProperty | DynamicKey>;

export type QueryStoreSchema = Record<string, null | QueryFactorySchema>;

export type QueryStoreUnit<
  Key extends string = string,
  Entries extends object = {},
> = DefinitionKey<[Key]> & Entries;

export type AnyQueryStoreUnit = DefinitionKey<[string]> & object;

export type QueryStore<
  Entries extends Record<string, AnyQueryStoreUnit> = Record<
    string,
    AnyQueryStoreUnit
  >,
> = Prettify<Entries>;

export type QueryStoreFromSchema<StoreSchema extends QueryStoreSchema> =
  QueryStore<{
    [P in keyof StoreSchema & string]: StoreSchema[P] extends QueryFactorySchema
      ? QueryStoreUnitFromSchema<P, StoreSchema[P]>
      : QueryStoreUnit<P>;
  }>;

type InvalidSchema<Schema extends QueryFactorySchema> = Omit<
  Schema,
  InternalKey
>;

type StrictFactoryObject<
  T extends { queryKey: AnyMutableOrReadonlyArray | null },
> = {
  [K in keyof T]: K extends ReservedFactoryKey
    ? T[K]
    : T[K] extends (...args: infer Args) => infer Result
      ? (...args: Args) => StrictOptions<Result>
      : T[K] extends null | AnyMutableOrReadonlyArray
        ? T[K]
        : T[K] extends { queryKey: AnyMutableOrReadonlyArray | null }
          ? StrictFactoryObject<T[K]>
          : never;
};

export type StrictOptions<T> = T extends AnyMutableOrReadonlyArray
  ? T
  : T extends { queryKey: AnyMutableOrReadonlyArray | null }
    ? StrictFactoryObject<T>
    : T extends null
      ? T
      : never;

export type ValidateFactory<Schema extends QueryFactorySchema> =
  ExtractInternalKeys<Schema> extends never
    ? {
        [P in keyof Schema]: Schema[P] extends (...args: infer Args) => infer R
          ? (...args: Args) => StrictOptions<R>
          : Schema[P];
      }
    : InvalidSchema<Schema>;

type ExtractNullableKey<
  Key extends AnyMutableOrReadonlyArray | null | undefined,
> = Key extends [...infer Value] | readonly [...infer Value]
  ? Value
  : Key extends null | undefined | unknown
    ? null
    : never;

type ComposeQueryKey<
  BaseKey extends AnyMutableOrReadonlyArray,
  Key,
> = Key extends AnyMutableOrReadonlyArray
  ? readonly [...BaseKey, ...Key]
  : readonly [...BaseKey];

export interface QueryOptionsStruct<
  Keys extends AnyMutableOrReadonlyArray,
  Fetcher extends QueryFunction,
  FetcherResult extends ReturnType<Fetcher> = ReturnType<Fetcher>,
> {
  queryFn: QueryFunction<Awaited<FetcherResult>, readonly [...Keys]>;
  queryKey: readonly [...Keys];
}

type DefinitionForFactory<
  BaseKey extends AnyMutableOrReadonlyArray,
  SchemaQueryKey extends AnyMutableOrReadonlyArray | null,
> = SchemaQueryKey extends null ? object : DefinitionKey<BaseKey>;

type NestedFactoryOutputs<
  Keys extends AnyMutableOrReadonlyArray,
  Schema extends object,
> = {
  [P in Exclude<keyof Schema, ReservedFactoryKey> &
    string]: Schema[P] extends DynamicKey
    ? DynamicFactoryOutput<[...Keys, P], Schema[P]>
    : Schema[P] extends FactoryProperty
      ? StaticFactoryOutput<[...Keys, P], Schema[P]>
      : never;
};

type FactoryRecordOutput<
  BaseKey extends AnyMutableOrReadonlyArray,
  Schema extends {
    queryKey: AnyMutableOrReadonlyArray | null;
    queryFn?: QueryFunction;
  },
  SchemaQueryKey extends Schema["queryKey"] = Schema["queryKey"],
  ComposedKey extends AnyMutableOrReadonlyArray = ComposeQueryKey<
    BaseKey,
    ExtractNullableKey<SchemaQueryKey>
  >,
> = (Schema["queryFn"] extends QueryFunction
  ? QueryOptionsStruct<ComposedKey, Schema["queryFn"]>
  : Omit<QueryOptionsStruct<ComposedKey, QueryFunction>, "queryFn">) &
  DefinitionForFactory<BaseKey, SchemaQueryKey> &
  NestedFactoryOutputs<ComposedKey, Schema>;

type DynamicFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Generator extends DynamicKey,
  Output extends ReturnType<Generator> = ReturnType<Generator>,
> = ((
  ...args: Parameters<Generator>
) => Output extends [...infer TupleResult] | readonly [...infer TupleResult]
  ? Omit<
      QueryOptionsStruct<[...Keys, ...TupleResult], QueryFunction>,
      "queryFn"
    >
  : Output extends DynamicFactoryObjectSchema
    ? Omit<FactoryRecordOutput<Keys, Output>, "_def">
    : never) &
  DefinitionKey<Keys>;

export type AnyDynamicQueryStoreUnit = DynamicFactoryOutput<
  [string, ...unknown[]],
  DynamicKey
>;

export type AnyStaticQueryStoreEntry = StaticFactoryOutput<
  AnyMutableOrReadonlyArray,
  FactoryProperty
>;

export type StaticFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Property extends FactoryProperty,
> = Property extends null
  ? Omit<QueryOptionsStruct<Keys, QueryFunction>, "queryFn">
  : Property extends [...infer Result] | readonly [...infer Result]
    ? DefinitionKey<Keys> &
        Omit<QueryOptionsStruct<[...Keys, ...Result], QueryFunction>, "queryFn">
    : Property extends StaticFactoryObjectSchema
      ? FactoryRecordOutput<Keys, Property>
      : never;

type QueryStoreUnitEntries<
  Key extends string,
  Schema extends QueryFactorySchema,
> = {
  [P in keyof Schema]: Schema[P] extends DynamicKey
    ? DynamicFactoryOutput<[Key, P], Schema[P]>
    : Schema[P] extends FactoryProperty
      ? StaticFactoryOutput<[Key, P], Schema[P]>
      : never;
};

export type QueryStoreUnitFromSchema<
  Key extends string,
  Schema extends QueryFactorySchema,
> = QueryStoreUnit<Key, QueryStoreUnitEntries<Key, Schema>>;
