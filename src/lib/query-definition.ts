import { omitPrototype } from "../internals/omit-prototype";
import type { AnyMutableOrReadonlyArray } from "../types/core";
import type {
  DependentDefinitionHints,
  DependsOnMap,
  DynamicFactory,
  DynamicFactoryBodyHints,
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
  const Shape extends Record<string, unknown>,
>(
  definition: Shape & DependentDefinitionHints<TQueryFnData, TDependsOn>
): StaticQueryDefinition<Shape>;
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
 * form `q.static(...)` accepts (no inner wrapper needed) — including `dependsOn`
 * maps and infinite-query fields — or a `q.static(...)` result.
 *
 * Single unified signature. `const Shape` captures the exact factory-body
 * literal (queryKey tuples, nested children, option fields, or a wrapped
 * `q.static(...)` definition) for output routing, while the intersected
 * `DynamicFactoryBodyHints` co-infers `dependsOn`, `initialPageParam`, and the
 * page type so the (optionally two-argument) `queryFn` is contextually typed —
 * no `q.static(...)` wrapper needed for dependent bodies.
 *
 * This MUST stay a single signature: TypeScript discards contextual typing of a
 * `queryFn` nested in a factory's return type as soon as the call is overloaded,
 * which collapses `dependsOn`-driven inference of the second argument. Infinite
 * bodies still get the strongest `pageParam` / `lastPage` inference through the
 * `q.static(...)` wrap; a plain infinite body is accepted but its `pageParam`
 * may stay loosely typed.
 */
export function dynamicQuery<
  // biome-ignore lint/suspicious/noExplicitAny: bivariant args allow narrower callsite tuples
  TArgs extends readonly any[],
  TQueryFnData,
  TPageParam,
  const TDependsOn extends DependsOnMap,
  const Shape extends object,
>(
  factory: (
    ...args: TArgs
  ) => Shape & DynamicFactoryBodyHints<TQueryFnData, TPageParam, TDependsOn>
): DynamicQueryDefinition<(...args: TArgs) => Shape>;
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
