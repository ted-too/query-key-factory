import { omitPrototype } from "../internals/omit-prototype";
import type { AnyMutableOrReadonlyArray } from "../types/core";
import type {
  AnyStaticOrInfiniteQueryDefinition,
  DependentDefinitionShape,
  DependsOnMap,
  DynamicFactory,
  DynamicQueryDefinition,
  EmptyDependsOnMap,
  EmptyStaticDefinitionError,
  InfiniteDefinitionShape,
  InfiniteQueryDefinition,
  StaticDefinitionShape,
  StaticQueryDefinition,
  ValidateStaticDefinition,
} from "../types/query-store";

const INFINITE_MARKER = "initialPageParam";

const hasInfiniteMarker = (value: Record<string, unknown>): boolean =>
  INFINITE_MARKER in value;

/**
 * Wraps a query definition. Dispatches to infinite or static at the type level
 * via overloads (presence of `initialPageParam` switches the variant) and at
 * runtime via the same marker.
 *
 * - **Infinite overload** is matched whenever the literal supplies
 *   `initialPageParam` + `getNextPageParam`. `pageParam`, `lastPage`,
 *   `allPages`, etc. are inferred from `queryFn` and `initialPageParam`.
 *   Inline nested children are not supported on this overload (TypeScript
 *   cannot combine generic inference with arbitrary nested-child inference at
 *   the same time).
 * - **Static overload** is the default. Supports inline nested children, the
 *   full TanStack `QueryObserverOptions` surface, and explicit `queryKey`
 *   suffixes.
 */
export function staticQuery<
  TQueryFnData,
  TPageParam,
  const TDependsOn extends DependsOnMap = EmptyDependsOnMap,
  const TQueryKey extends
    | AnyMutableOrReadonlyArray
    | null
    | undefined = undefined,
>(
  definition: InfiniteDefinitionShape<
    TQueryFnData,
    TPageParam,
    TDependsOn,
    TQueryKey
  >
): InfiniteQueryDefinition<
  InfiniteDefinitionShape<TQueryFnData, TPageParam, TDependsOn, TQueryKey>
>;
export function staticQuery<
  TQueryFnData,
  const TDependsOn extends DependsOnMap,
  const TQueryKey extends
    | AnyMutableOrReadonlyArray
    | null
    | undefined = undefined,
>(
  definition: DependentDefinitionShape<TQueryFnData, TDependsOn, TQueryKey>
): StaticQueryDefinition<
  DependentDefinitionShape<TQueryFnData, TDependsOn, TQueryKey>
>;
export function staticQuery<const Shape extends StaticDefinitionShape>(
  definition: keyof Shape extends never
    ? EmptyStaticDefinitionError
    : Shape & ValidateStaticDefinition<Shape>
): StaticQueryDefinition<Shape>;
export function staticQuery(
  definition: Record<string, unknown>
): StaticQueryDefinition | InfiniteQueryDefinition {
  if (Object.keys(definition).length === 0) {
    throw new Error(
      "q.static({}) is not allowed: provide queryFn, queryKey, and/or at least one child"
    );
  }

  return omitPrototype({
    _type: hasInfiniteMarker(definition)
      ? "infinite-query-definition"
      : "static-query-definition",
    definition,
  }) as StaticQueryDefinition | InfiniteQueryDefinition;
}

/**
 * Wraps a factory that produces a query definition shape, parameterized by
 * arbitrary arguments. The factory body is a plain object literal of the same
 * form `q.static(...)` accepts (no inner wrapper needed). Infinite vs static is
 * detected via the presence of `initialPageParam`.
 *
 * Implementation note on overload ordering: the static overload is placed
 * first. TypeScript propagates the contextual type of the *first* overload
 * into the callback body when inferring, so leading with the static shape
 * gives standard queries (`queryFn(ctx)` with `signal`, `meta`, etc.) clean
 * inference. Literals containing `initialPageParam` fail the static overload's
 * `ValidateStaticDefinition` check (the field collapses to `never`) and fall
 * through to the infinite overload, which then infers `TPageParam` and
 * propagates it to `queryFn`/`getNextPageParam`.
 */
/**
 * Plain-object factory: the factory body is a literal of the same form
 * `q.static(...)` accepts. The body's contextual type is the full
 * `StaticDefinitionShape`, so `queryFn`'s `signal`/`meta`/etc. are inferred
 * directly with no inner wrapper.
 *
 * Infinite-query factories also flow through this signature - because
 * `StaticDefinitionShape` has a `[key: string]: unknown` index signature it
 * accepts `initialPageParam` / `getNextPageParam`. The type-level dispatch in
 * `DynamicFactoryOutput` then routes the resulting shape to
 * `InfiniteFactoryOutput`. The trade-off: `pageParam` / `lastPage` aren't
 * inferred for inline infinite factories - annotate `queryFn` and
 * `getNextPageParam` parameters explicitly when you need that inference,
 * or wrap with `q.static(...)` (matched by the alternate overload below) to
 * recover full inference.
 */
export function dynamicQuery<
  // biome-ignore lint/suspicious/noExplicitAny: bivariant args allow narrower callsite tuples
  TArgs extends readonly any[],
  const Shape extends StaticDefinitionShape,
>(
  factory: (...args: TArgs) => Shape
): DynamicQueryDefinition<(...args: TArgs) => Shape>;
/**
 * Wrapped-definition overload: kept so callers can opt into `q.static(...)`'s
 * own overload set when they need full infinite-query inference for the
 * `pageParam` / `lastPage` callbacks inside a dynamic factory.
 *
 * Common usage: `q.dynamic((id) => q.static({ initialPageParam: 0, ... }))`.
 */
export function dynamicQuery<
  // biome-ignore lint/suspicious/noExplicitAny: bivariant args allow narrower callsite tuples
  const F extends (...args: any[]) => AnyStaticOrInfiniteQueryDefinition,
>(factory: F): DynamicQueryDefinition<F>;
export function dynamicQuery(
  factory: DynamicFactory
): DynamicQueryDefinition<DynamicFactory> {
  return omitPrototype({
    _type: "dynamic-query-definition",
    definition: factory,
  }) as DynamicQueryDefinition<DynamicFactory>;
}

export const isStaticQueryDefinition = (
  value: unknown
): value is StaticQueryDefinition<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  "_type" in value &&
  value._type === "static-query-definition";

export const isInfiniteQueryDefinition = (
  value: unknown
): value is InfiniteQueryDefinition<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  "_type" in value &&
  value._type === "infinite-query-definition";

export const isDynamicQueryDefinition = (
  value: unknown
): value is DynamicQueryDefinition =>
  typeof value === "object" &&
  value !== null &&
  "_type" in value &&
  value._type === "dynamic-query-definition";

/**
 * True when a plain shape (the kind produced by a `q.dynamic` factory body
 * after invocation) carries the infinite-query marker.
 */
export const isInfiniteShape = (value: Record<string, unknown>): boolean =>
  hasInfiniteMarker(value);
