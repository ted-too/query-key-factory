import type {
  DefaultError,
  QueryFunction,
  QueryObserverOptions,
} from "@tanstack/query-core";
import type { ExtractInternalKeys, InternalKey } from "../internals/types";
import type {
  AnyMutableOrReadonlyArray,
  DefinitionKey,
  Prettify,
} from "./core";

export type AnyQueryKey = readonly [string, ...unknown[]];

export interface StaticQueryDefinition<
  Shape extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly _type: "static-query-definition";
  readonly definition: Shape;
}

export interface DynamicQueryDefinition<
  Factory extends (
    ...args: readonly never[]
  ) => StaticQueryDefinition<Record<string, unknown>> = (
    ...args: readonly never[]
  ) => StaticQueryDefinition<Record<string, unknown>>,
> {
  readonly _type: "dynamic-query-definition";
  readonly definition: Factory;
}

export type AnyQueryDefinition =
  | StaticQueryDefinition<Record<string, unknown>>
  | DynamicQueryDefinition<
      (
        ...args: readonly never[]
      ) => StaticQueryDefinition<Record<string, unknown>>
    >;

export type QueryFactorySchema = Record<string, AnyQueryDefinition>;

export type QueryStoreSchema = Record<string, QueryFactorySchema>;

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
    [P in keyof StoreSchema & string]: QueryStoreUnitFromSchema<
      P,
      StoreSchema[P]
    >;
  }>;

type InvalidSchema<Schema extends Record<string, unknown>> = Omit<
  Schema,
  InternalKey
>;

type ContextualQueryOptions = Omit<
  QueryObserverOptions<
    unknown,
    DefaultError,
    unknown,
    unknown,
    AnyMutableOrReadonlyArray
  >,
  "queryKey"
> & {
  queryKey?: AnyMutableOrReadonlyArray | null;
};

type QueryOptionKey = keyof ContextualQueryOptions;

export type ValidateStaticDefinition<Shape extends Record<string, unknown>> =
  ExtractInternalKeys<Shape> extends never
    ? {
        [K in keyof Shape]: K extends QueryOptionKey
          ? ContextualQueryOptions[K]
          : Shape[K] extends AnyQueryDefinition
            ? Shape[K]
            : never;
      }
    : InvalidSchema<Shape>;

export type ValidateFactory<Schema extends QueryFactorySchema> =
  ExtractInternalKeys<Schema> extends never ? Schema : InvalidSchema<Schema>;

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

type NodeQueryKey<Shape extends object> = Shape extends {
  queryKey?: infer QueryKey;
}
  ? QueryKey extends AnyMutableOrReadonlyArray | null | undefined
    ? QueryKey
    : undefined
  : undefined;

type NodeQueryFn<Shape extends object> = Shape extends {
  queryFn?: infer Fetcher;
}
  ? Fetcher extends (...args: readonly unknown[]) => unknown
    ? Fetcher
    : never
  : never;

type NodeOptionEntries<Shape extends object> = Pick<
  Shape,
  Extract<keyof Shape, QueryOptionKey>
>;

type NodeOptionOverrides<Shape extends object> = Omit<
  NodeOptionEntries<Shape>,
  "queryKey" | "queryFn"
>;

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
  SchemaQueryKey extends AnyMutableOrReadonlyArray | null | undefined,
> = SchemaQueryKey extends null ? object : DefinitionKey<BaseKey>;

type NestedFactoryOutputs<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = {
  [P in Exclude<keyof Shape, QueryOptionKey> &
    string as Shape[P] extends AnyQueryDefinition
    ? P
    : never]: Shape[P] extends StaticQueryDefinition<infer ChildShape>
    ? StaticFactoryOutput<[...Keys, P], ChildShape>
    : Shape[P] extends DynamicQueryDefinition<infer Factory>
      ? DynamicFactoryOutput<[...Keys, P], Factory>
      : never;
};

type FactoryRecordOutput<
  BaseKey extends AnyMutableOrReadonlyArray,
  Shape extends object,
  SchemaQueryKey extends
    | AnyMutableOrReadonlyArray
    | null
    | undefined = NodeQueryKey<Shape>,
  ComposedKey extends AnyMutableOrReadonlyArray = ComposeQueryKey<
    BaseKey,
    ExtractNullableKey<SchemaQueryKey>
  >,
> = Prettify<
  DefinitionForFactory<BaseKey, SchemaQueryKey> &
    NodeOptionOverrides<Shape> & {
      queryKey: readonly [...ComposedKey];
    } & (NodeQueryFn<Shape> extends QueryFunction
      ? QueryOptionsStruct<ComposedKey, NodeQueryFn<Shape>>
      : object) &
    NestedFactoryOutputs<ComposedKey, Shape>
>;

type DynamicFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Factory extends (
    ...args: readonly never[]
  ) => StaticQueryDefinition<Record<string, unknown>>,
> = ((
  ...args: Parameters<Factory>
) => Omit<
  StaticFactoryOutput<
    Keys,
    ReturnType<Factory> extends StaticQueryDefinition<infer Shape>
      ? Shape
      : never
  >,
  "_def"
>) &
  DefinitionKey<Keys>;

export type AnyDynamicQueryStoreUnit = DynamicFactoryOutput<
  [string, ...unknown[]],
  (...args: readonly never[]) => StaticQueryDefinition<Record<string, unknown>>
>;

export type AnyStaticQueryStoreEntry = StaticFactoryOutput<
  AnyMutableOrReadonlyArray,
  Record<string, unknown>
>;

export type StaticFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = FactoryRecordOutput<Keys, Shape>;

type QueryStoreUnitEntries<
  Key extends string,
  Schema extends QueryFactorySchema,
> = {
  [P in keyof Schema]: Schema[P] extends StaticQueryDefinition<infer Shape>
    ? StaticFactoryOutput<[Key, P], Shape>
    : Schema[P] extends DynamicQueryDefinition<infer Factory>
      ? DynamicFactoryOutput<[Key, P], Factory>
      : never;
};

export type QueryStoreUnitFromSchema<
  Key extends string,
  Schema extends QueryFactorySchema,
> = QueryStoreUnit<Key, QueryStoreUnitEntries<Key, Schema>>;
