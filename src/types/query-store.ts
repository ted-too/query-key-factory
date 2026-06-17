import type {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserverOptions,
  QueryFunction,
  QueryFunctionContext,
  QueryObserverOptions,
} from "@tanstack/query-core";
import type { ExtractInternalKeys, InternalKey } from "../internals/types";
import type {
  AnyMutableOrReadonlyArray,
  DefinitionKey,
  Prettify,
} from "./core";

export type AnyQueryKey = readonly [string, ...unknown[]];

/**
 * Structural "any function" used only for arity-agnostic gating: dependent
 * nodes author a two-argument `queryFn` (context + resolved dependencies),
 * which is not assignable to TanStack's single-argument `QueryFunction`. The
 * emitted node always exposes a standard single-argument `QueryFunction`.
 */
// biome-ignore lint/suspicious/noExplicitAny: matching a function of any arity is intentional here
type AnyQueryFnLike = (...args: any[]) => unknown;

export interface StaticQueryDefinition<
  Shape extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly _type: "static-query-definition";
  readonly definition: Shape;
}

export interface InfiniteQueryDefinition<
  Shape extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly _type: "infinite-query-definition";
  readonly definition: Shape;
}

export type AnyStaticOrInfiniteQueryDefinition =
  | StaticQueryDefinition<Record<string, unknown>>
  | InfiniteQueryDefinition<Record<string, unknown>>;

/**
 * `q.dynamic`'s factory returns either a plain shape (preferred) or a
 * `q.static(...)`-wrapped definition. The shape is dispatched to either the
 * static or infinite output type by inspecting `initialPageParam` (after
 * unwrapping the wrapper when present).
 *
 * Uses `any[]` so that narrower callsite tuples (e.g. `(userId: string)`)
 * remain assignable to the constraint.
 */
export type DynamicFactory = (
  // biome-ignore lint/suspicious/noExplicitAny: bivariance is required so callers' specific TArgs assign to DynamicFactory
  ...args: any[]
) => Record<string, unknown> | AnyStaticOrInfiniteQueryDefinition;

export interface DynamicQueryDefinition<
  Factory extends DynamicFactory = DynamicFactory,
> {
  readonly _type: "dynamic-query-definition";
  readonly definition: Factory;
}

export type AnyQueryDefinition =
  | StaticQueryDefinition<Record<string, unknown>>
  | InfiniteQueryDefinition<Record<string, unknown>>
  | DynamicQueryDefinition;

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

type ContextualInfiniteQueryOptions<
  TQueryFnData = unknown,
  TPageParam = unknown,
  TQueryKey extends AnyMutableOrReadonlyArray = AnyMutableOrReadonlyArray,
> = Omit<
  InfiniteQueryObserverOptions<
    TQueryFnData,
    DefaultError,
    InfiniteData<TQueryFnData, TPageParam>,
    TQueryKey,
    TPageParam
  >,
  "queryKey"
> & {
  queryKey?: AnyMutableOrReadonlyArray | null;
};

type InfiniteQueryOptionKey = keyof ContextualInfiniteQueryOptions;

type AnyQueryOptionKey = QueryOptionKey | InfiniteQueryOptionKey;

export type StaticDefinitionShape = Partial<ContextualQueryOptions> & {
  [key: string]: unknown;
};

/**
 * Minimal options shape a dependency must expose so it can be loaded via
 * `queryClient.ensureQueryData`. Every materialised node produced by this
 * library already satisfies it.
 */
interface DependencyQueryOptions {
  queryFn: (...args: never[]) => unknown;
  queryKey: AnyMutableOrReadonlyArray;
}

/**
 * A single entry in a `dependsOn` map. Either:
 *   - resolved query options directly (a materialised node, e.g.
 *     `reference.countries` or `products.detail(sku)`) — preferred, since it
 *     reuses that query's canonical cache entry; or
 *   - an inline `q.static(...)` / `q.infinite(...)` definition (escape hatch),
 *     which gets its own derived cache key under the parent node and therefore
 *     does not share a cache entry with any canonical query elsewhere.
 */
export type DependencyInput =
  | DependencyQueryOptions
  | AnyStaticOrInfiniteQueryDefinition;

export type DependsOnMap = Record<string, DependencyInput>;

/** Default `dependsOn` for nodes that declare none: an empty dependency map. */
export type EmptyDependsOnMap = Record<never, never>;

type DependencyFnData<Fetcher> = Fetcher extends (
  ...args: never[]
) => infer Result
  ? Awaited<Result>
  : unknown;

type ResolveDependencyData<Dependency> =
  Dependency extends StaticQueryDefinition<infer Shape>
    ? Shape extends { queryFn: infer Fetcher }
      ? DependencyFnData<Fetcher>
      : unknown
    : Dependency extends InfiniteQueryDefinition<infer Shape>
      ? Shape extends { queryFn: infer Fetcher }
        ? DependencyFnData<Fetcher>
        : unknown
      : Dependency extends { queryFn: infer Fetcher }
        ? DependencyFnData<Fetcher>
        : unknown;

/**
 * Maps a `dependsOn` declaration to the resolved-data object handed to the
 * authored `queryFn` as its second argument.
 */
export type ResolveDependsOnData<Dependencies extends DependsOnMap> = {
  [Name in keyof Dependencies]: ResolveDependencyData<Dependencies[Name]>;
};

/**
 * Input shape for a `q.static(...)` node that prefetches dependencies before
 * running its own `queryFn`. The authored `queryFn` receives a second argument
 * holding the resolved data for each `dependsOn` entry, keyed by the same name.
 *
 * Dependencies are loaded in parallel via `queryClient.ensureQueryData`, which
 * returns cached data when present and only fetches when absent. This is a
 * one-shot prefetch, not a reactive subscription: invalidating a dependency
 * does not refetch this node.
 *
 * Like infinite definitions, dependent definitions do not support inline nested
 * children; place siblings alongside the node or wrap it in a parent scope.
 */
export type DependentDefinitionShape<
  TQueryFnData,
  TDependsOn extends DependsOnMap,
  TQueryKey extends AnyMutableOrReadonlyArray | null | undefined = undefined,
> = Omit<Partial<ContextualQueryOptions>, "queryKey" | "queryFn"> & {
  queryKey?: TQueryKey;
  dependsOn: TDependsOn;
  queryFn: (
    context: QueryFunctionContext<AnyMutableOrReadonlyArray>,
    dependencies: ResolveDependsOnData<TDependsOn>
  ) => TQueryFnData | Promise<TQueryFnData>;
};

/**
 * Surfaced when a caller passes `q.static({})`. The message is a string
 * literal so TypeScript renders it in the diagnostic (e.g. "Type '{}' is not
 * assignable to type 'EmptyStaticDefinitionError'.").
 */
export interface EmptyStaticDefinitionError {
  __error: "q.static({}) is not allowed: provide queryFn, queryKey, and/or at least one child";
}

/**
 * Used as the parameter type for `q.infinite(...)`. TQueryFnData, TPageParam,
 * and TQueryKey appear in inference positions (queryFn return, initialPageParam
 * value, queryKey value), so TypeScript can recover all three from the user's
 * literal and bind getNextPageParam / getPreviousPageParam to the right page /
 * data types.
 *
 * Note: unlike `q.static`, `q.infinite` does not support inline nested children.
 * Wrap it in `q.static`, `q.dynamic`, or place it as a sibling property instead.
 */
export type InfiniteDefinitionShape<
  TQueryFnData,
  TPageParam,
  TDependsOn extends DependsOnMap = EmptyDependsOnMap,
  TQueryKey extends AnyMutableOrReadonlyArray | null | undefined = undefined,
> = Omit<
  Partial<ContextualInfiniteQueryOptions<TQueryFnData, TPageParam>>,
  "queryKey" | "queryFn"
> & {
  queryKey?: TQueryKey;
  dependsOn?: TDependsOn;
  initialPageParam: TPageParam;
  // `NoInfer` keeps `getNextPageParam` a pure consumer of the page data /
  // page-param types: `TQueryFnData` is inferred solely from `queryFn`'s return
  // and `TPageParam` solely from `initialPageParam`. Without this, a non-empty
  // `dependsOn` (which adds a second `queryFn` argument) makes `lastPage` a
  // competing inference site and collapses the page type.
  getNextPageParam: NonNullable<
    ContextualInfiniteQueryOptions<
      NoInfer<TQueryFnData>,
      NoInfer<TPageParam>
    >["getNextPageParam"]
  >;
  queryFn: (
    context: QueryFunctionContext<AnyMutableOrReadonlyArray, TPageParam>,
    dependencies: ResolveDependsOnData<TDependsOn>
  ) => TQueryFnData | Promise<TQueryFnData>;
};

export type ValidateStaticDefinition<Shape extends Record<string, unknown>> =
  ExtractInternalKeys<Shape> extends never
    ? {
        [K in keyof Shape]: string extends K
          ? Shape[K]
          : K extends QueryOptionKey
            ? ContextualQueryOptions[K]
            : Shape[K] extends AnyQueryDefinition
              ? Shape[K]
              : never;
      }
    : InvalidSchema<Shape>;

export type ValidateInfiniteDefinition<Shape extends Record<string, unknown>> =
  ExtractInternalKeys<Shape> extends never
    ? {
        [K in keyof Shape]: string extends K
          ? Shape[K]
          : K extends InfiniteQueryOptionKey
            ? ContextualInfiniteQueryOptions[K]
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
  ? Fetcher extends AnyQueryFnLike
    ? Fetcher
    : never
  : never;

type NodeOptionEntries<Shape extends object> = Pick<
  Shape,
  Extract<keyof Shape, AnyQueryOptionKey>
>;

type NodeOptionOverrides<Shape extends object> = Omit<
  NodeOptionEntries<Shape>,
  "queryKey" | "queryFn"
>;

/**
 * Like `NodeOptionOverrides`, but for nodes where some options reference the
 * tanstack TQueryKey generic (e.g. `enabled`, `staleTime` callbacks). We rebind
 * those to the specific composed key so the output type is assignable to a
 * `useQuery` / `useInfiniteQuery` slot once those hooks infer their own
 * TQueryKey from `queryKey`.
 */
type NodeRebindableOptionsForInfinite<
  Shape extends object,
  Keys extends AnyMutableOrReadonlyArray,
  TQueryFnData,
  TPageParam,
> = {
  [K in keyof NodeOptionOverrides<Shape>]: K extends keyof ContextualInfiniteQueryOptions<
    TQueryFnData,
    TPageParam,
    Keys
  >
    ? ContextualInfiniteQueryOptions<TQueryFnData, TPageParam, Keys>[K]
    : NodeOptionOverrides<Shape>[K];
};

/**
 * `ContextualQueryOptions` rebound to a concrete data type and composed key, so
 * dependent-node option overrides (e.g. `staleTime`, `enabled`) line up with
 * the `useQuery` slot once the hook infers its own generics.
 */
type ContextualQueryOptionsOf<
  TQueryFnData,
  TQueryKey extends AnyMutableOrReadonlyArray,
> = Omit<
  QueryObserverOptions<
    TQueryFnData,
    DefaultError,
    TQueryFnData,
    TQueryFnData,
    TQueryKey
  >,
  "queryKey"
>;

type NodeRebindableOptions<
  Shape extends object,
  Keys extends AnyMutableOrReadonlyArray,
  TQueryFnData,
> = {
  [K in keyof NodeOptionOverrides<Shape>]: K extends keyof ContextualQueryOptionsOf<
    TQueryFnData,
    Keys
  >
    ? ContextualQueryOptionsOf<TQueryFnData, Keys>[K]
    : NodeOptionOverrides<Shape>[K];
};

type NodePageParam<Shape extends object> = Shape extends {
  initialPageParam: infer PageParam;
}
  ? PageParam
  : Shape extends { initialPageParam?: infer PageParam }
    ? PageParam
    : unknown;

export interface QueryOptionsStruct<
  Keys extends AnyMutableOrReadonlyArray,
  Fetcher extends AnyQueryFnLike,
  FetcherResult extends ReturnType<Fetcher> = ReturnType<Fetcher>,
> {
  queryFn: QueryFunction<Awaited<FetcherResult>, readonly [...Keys]>;
  queryKey: readonly [...Keys];
}

export interface InfiniteQueryOptionsStruct<
  Keys extends AnyMutableOrReadonlyArray,
  Fetcher extends AnyQueryFnLike,
  PageParam,
  FetcherResult extends ReturnType<Fetcher> = ReturnType<Fetcher>,
> {
  queryFn: QueryFunction<Awaited<FetcherResult>, readonly [...Keys], PageParam>;
  queryKey: readonly [...Keys];
}

type NestedFactoryOutputs<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = {
  [P in Exclude<keyof Shape, AnyQueryOptionKey> &
    string as Shape[P] extends AnyQueryDefinition
    ? P
    : never]: Shape[P] extends DynamicQueryDefinition<infer Factory>
    ? DynamicFactoryOutput<[...Keys, P], Factory>
    : Shape[P] extends InfiniteQueryDefinition<infer ChildShape>
      ? InfiniteFactoryOutput<[...Keys, P], ChildShape>
      : Shape[P] extends StaticQueryDefinition<infer ChildShape>
        ? StaticOrDependentFactoryOutput<[...Keys, P], ChildShape>
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
  NodeOptionOverrides<Shape> & {
    queryKey: readonly [...ComposedKey];
  } & (NodeQueryFn<Shape> extends AnyQueryFnLike
      ? QueryOptionsStruct<ComposedKey, NodeQueryFn<Shape>>
      : object) &
    NestedFactoryOutputs<ComposedKey, Shape>
>;

type InfiniteFactoryRecordOutput<
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
  TPageParam = NodePageParam<Shape>,
  TQueryFnData = NodeQueryFn<Shape> extends AnyQueryFnLike
    ? Awaited<ReturnType<NodeQueryFn<Shape>>>
    : unknown,
> = Prettify<
  NodeRebindableOptionsForInfinite<
    Shape,
    readonly [...ComposedKey],
    TQueryFnData,
    TPageParam
  > & {
    queryKey: readonly [...ComposedKey];
  } & (NodeQueryFn<Shape> extends AnyQueryFnLike
      ? InfiniteQueryOptionsStruct<ComposedKey, NodeQueryFn<Shape>, TPageParam>
      : object) &
    DependsOnOutputFor<Shape, readonly [...ComposedKey]> &
    NestedFactoryOutputs<ComposedKey, Shape>
>;

/**
 * Resolves a single `dependsOn` entry to the node it becomes on the output.
 * Inline `q.static(...)` / `q.infinite(...)` definitions are materialised under
 * a derived key (so their `queryKey` is `[...dependent, name]`); plain values
 * (already-materialised nodes such as `reference.countries`) pass through
 * unchanged, preserving their canonical key.
 */
type ResolvedDependencyNode<Dependency, Key extends AnyMutableOrReadonlyArray> =
  Dependency extends StaticQueryDefinition<infer Shape>
    ? StaticOrDependentFactoryOutput<Key, Shape>
    : Dependency extends InfiniteQueryDefinition<infer Shape>
      ? InfiniteFactoryOutput<Key, Shape>
      : Dependency;

/**
 * The resolved `dependsOn` map exposed on a dependent node, e.g.
 * `session.me.dependsOn.countries.queryKey`. Each entry is the materialised
 * dependency node, so inline dependencies remain invalidatable by key.
 */
type DependsOnOutput<
  TDependsOn extends DependsOnMap,
  BaseKey extends AnyMutableOrReadonlyArray,
> = {
  [K in keyof TDependsOn & string]: ResolvedDependencyNode<
    TDependsOn[K],
    readonly [...BaseKey, K]
  >;
};

type DependsOnOutputFor<
  Shape extends object,
  ComposedKey extends AnyMutableOrReadonlyArray,
> = Shape extends { dependsOn?: infer Dependencies }
  ? Dependencies extends DependsOnMap
    ? keyof Dependencies extends never
      ? object
      : { dependsOn: DependsOnOutput<Dependencies, ComposedKey> }
    : object
  : object;

type DependentFactoryRecordOutput<
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
  TQueryFnData = NodeQueryFn<Shape> extends AnyQueryFnLike
    ? Awaited<ReturnType<NodeQueryFn<Shape>>>
    : unknown,
> = Prettify<
  NodeRebindableOptions<Shape, readonly [...ComposedKey], TQueryFnData> & {
    queryKey: readonly [...ComposedKey];
  } & (NodeQueryFn<Shape> extends AnyQueryFnLike
      ? QueryOptionsStruct<ComposedKey, NodeQueryFn<Shape>>
      : object) &
    DependsOnOutputFor<Shape, readonly [...ComposedKey]> &
    NestedFactoryOutputs<ComposedKey, Shape>
>;

/**
 * A `q.static(...)` node carrying a `dependsOn` map is routed through the
 * dependent output transform (option overrides rebound to the authored
 * `queryFn`'s data); everything else uses the standard static transform.
 */
type StaticOrDependentFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = Shape extends { dependsOn: DependsOnMap }
  ? DependentFactoryRecordOutput<Keys, Shape>
  : StaticFactoryOutput<Keys, Shape>;

/**
 * Detects whether a plain shape is an infinite-query shape via the presence of
 * `initialPageParam`. Used to dispatch a `q.dynamic(...)` factory's plain-object
 * return to the right output transform.
 */
type IsInfiniteShape<Shape> = Shape extends { initialPageParam: unknown }
  ? true
  : false;

/**
 * Resolves a `q.dynamic` factory's effective shape. Three cases:
 *   - Plain shape: used directly.
 *   - `q.static`-wrapped (returns `StaticQueryDefinition<S>`): unwrap to `S`.
 *   - `q.static`-wrapped infinite (returns `InfiniteQueryDefinition<S>`):
 *     unwrap to `S` and let `IsInfiniteShape` re-detect it as infinite.
 */
type ResolveFactoryShape<R> =
  R extends StaticQueryDefinition<infer S>
    ? S
    : R extends InfiniteQueryDefinition<infer S>
      ? S
      : R;

type DynamicFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Factory extends DynamicFactory,
  Shape = ResolveFactoryShape<ReturnType<Factory>>,
> = ((
  ...args: Parameters<Factory>
) => IsInfiniteShape<Shape> extends true
  ? InfiniteFactoryOutput<Keys, Shape & object>
  : StaticOrDependentFactoryOutput<Keys, Shape & object>) &
  DefinitionKey<Keys>;

export type AnyDynamicQueryStoreUnit = DynamicFactoryOutput<
  [string, ...unknown[]],
  DynamicFactory
>;

export type AnyStaticQueryStoreEntry = StaticFactoryOutput<
  AnyMutableOrReadonlyArray,
  Record<string, unknown>
>;

export type AnyInfiniteQueryStoreEntry = InfiniteFactoryOutput<
  AnyMutableOrReadonlyArray,
  Record<string, unknown>
>;

export type StaticFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = FactoryRecordOutput<Keys, Shape>;

export type InfiniteFactoryOutput<
  Keys extends AnyMutableOrReadonlyArray,
  Shape extends object,
> = InfiniteFactoryRecordOutput<Keys, Shape>;

type QueryStoreUnitEntries<
  Key extends string,
  Schema extends QueryFactorySchema,
> = {
  [P in keyof Schema]: Schema[P] extends DynamicQueryDefinition<infer Factory>
    ? DynamicFactoryOutput<[Key, P], Factory>
    : Schema[P] extends InfiniteQueryDefinition<infer Shape>
      ? InfiniteFactoryOutput<[Key, P], Shape>
      : Schema[P] extends StaticQueryDefinition<infer Shape>
        ? StaticOrDependentFactoryOutput<[Key, P], Shape>
        : never;
};

export type QueryStoreUnitFromSchema<
  Key extends string,
  Schema extends QueryFactorySchema,
> = QueryStoreUnit<Key, QueryStoreUnitEntries<Key, Schema>>;
