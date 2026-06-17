import type { QueryFunction, QueryFunctionContext } from "@tanstack/query-core";
import { assertSchemaKeys } from "../internals/assert-schema-keys";
import { omitPrototype } from "../internals/omit-prototype";
import type { AnyMutableOrReadonlyArray, DefinitionKey } from "../types/core";
import type {
  AnyDynamicQueryStoreUnit,
  AnyQueryKey,
  DynamicFactory,
  QueryFactorySchema,
  QueryStoreUnit,
  QueryStoreUnitFromSchema,
  ValidateFactory,
} from "../types/query-store";
import {
  isDynamicQueryDefinition,
  isInfiniteQueryDefinition,
  isStaticQueryDefinition,
} from "./query-definition";
import {
  ensureDependencyReactivity,
  queryHashForKey,
} from "./reactive-dependencies";

type RuntimeNodeShape = Record<string, unknown>;

interface DependencyQueryOptions {
  queryFn: QueryFunction;
  queryKey: AnyQueryKey;
}

type DependentUserQueryFn = (
  context: QueryFunctionContext,
  dependencies: Record<string, unknown>
) => unknown;

type TransformedSchemaMap<Schema extends QueryFactorySchema> = Map<
  keyof Schema,
  unknown
>;

const isReadonlyArray = (arg: unknown): arg is AnyMutableOrReadonlyArray =>
  Array.isArray(arg);

const isAnyQueryNode = (value: unknown): boolean =>
  isStaticQueryDefinition(value) ||
  isInfiniteQueryDefinition(value) ||
  isDynamicQueryDefinition(value);

const getNestedQueries = (
  definition: RuntimeNodeShape
): QueryFactorySchema | undefined => {
  const nestedEntries = Object.entries(definition).filter(([, value]) =>
    isAnyQueryNode(value)
  );

  if (nestedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(nestedEntries) as QueryFactorySchema;
};

const getQueryOptions = (definition: RuntimeNodeShape): RuntimeNodeShape =>
  Object.fromEntries(
    Object.entries(definition).filter(([, value]) => !isAnyQueryNode(value))
  );

export function createQueryKeys<Key extends string>(
  queryDef: Key
): QueryStoreUnit<Key>;
export function createQueryKeys<
  Key extends string,
  const Schema extends QueryFactorySchema,
>(
  queryDef: Key,
  schema: Schema & ValidateFactory<Schema>
): QueryStoreUnitFromSchema<Key, Schema>;
export function createQueryKeys<
  Key extends string,
  const Schema extends QueryFactorySchema,
>(
  queryDef: Key,
  schema?: Schema & ValidateFactory<Schema>
): QueryStoreUnit<Key> | QueryStoreUnitFromSchema<Key, Schema> {
  const defKey: DefinitionKey<[Key]> = {
    queryKey: [queryDef] as const,
  };

  const createNestedEntries = (
    nestedQueries: QueryFactorySchema,
    key: AnyQueryKey
  ) => omitPrototype(Object.fromEntries(transformSchema(nestedQueries, key)));

  const createNodeResult = (
    key: readonly [...AnyQueryKey, string] | readonly [...AnyQueryKey],
    shape: RuntimeNodeShape
  ) => {
    const options = getQueryOptions(shape);
    const suffix = options.queryKey;
    const innerKey = [
      ...key,
      ...(isReadonlyArray(suffix) ? suffix : []),
    ] as const;
    const nestedQueries = getNestedQueries(shape);
    const nestedEntries =
      nestedQueries == null
        ? undefined
        : createNestedEntries(nestedQueries, innerKey);
    const { queryKey: _queryKey, dependsOn, queryFn, ...restOptions } = options;

    const resolvedDependsOn =
      dependsOn != null && typeof dependsOn === "object"
        ? resolveDependsOnMap(innerKey, dependsOn as Record<string, unknown>)
        : undefined;

    const resolvedQueryFn =
      resolvedDependsOn !== undefined && typeof queryFn === "function"
        ? createDependentQueryFn(
            resolvedDependsOn,
            queryFn as DependentUserQueryFn
          )
        : queryFn;

    return omitPrototype({
      ...nestedEntries,
      ...restOptions,
      ...(resolvedQueryFn === undefined ? {} : { queryFn: resolvedQueryFn }),
      ...(resolvedDependsOn === undefined
        ? {}
        : { dependsOn: resolvedDependsOn }),
      queryKey: innerKey,
    });
  };

  const resolveDependencyOptions = (
    dependencyKey: readonly [...AnyQueryKey, string],
    dependencyValue: unknown
  ): DependencyQueryOptions => {
    if (
      isStaticQueryDefinition(dependencyValue) ||
      isInfiniteQueryDefinition(dependencyValue)
    ) {
      return createNodeResult(
        dependencyKey,
        dependencyValue.definition as RuntimeNodeShape
      ) as unknown as DependencyQueryOptions;
    }

    return dependencyValue as DependencyQueryOptions;
  };

  const resolveDependsOnMap = (
    nodeKey: readonly [...AnyQueryKey],
    dependsOn: Record<string, unknown>
  ): Record<string, DependencyQueryOptions> =>
    omitPrototype(
      Object.fromEntries(
        Object.entries(dependsOn).map(([name, value]) => [
          name,
          resolveDependencyOptions([...nodeKey, name], value),
        ])
      )
    );

  const createDependentQueryFn = (
    resolvedDependsOn: Record<string, DependencyQueryOptions>,
    userQueryFn: DependentUserQueryFn
  ) => {
    const dependencyEntries = Object.entries(resolvedDependsOn);

    return async (context: QueryFunctionContext) => {
      const registry = ensureDependencyReactivity(context.client);
      const dependentHash = queryHashForKey(context.client, context.queryKey);

      const resolved = await Promise.all(
        dependencyEntries.map(async ([name, dependencyOptions]) => {
          const data = await context.client.ensureQueryData(dependencyOptions);
          registry.link(
            queryHashForKey(context.client, dependencyOptions.queryKey),
            dependentHash,
            context.queryKey
          );
          return [name, data] as const;
        })
      );

      return userQueryFn(context, omitPrototype(Object.fromEntries(resolved)));
    };
  };

  const createDynamicCallback = (
    key: readonly [...AnyQueryKey, string],
    definition: QueryFactorySchema[string]
  ) => {
    const resultCallback = ((...args: readonly unknown[]) => {
      if (!isDynamicQueryDefinition(definition)) {
        throw new Error(
          "Dynamic query definitions must be created with q.dynamic"
        );
      }

      const factoryResult = (definition.definition as DynamicFactory)(...args);

      if (
        typeof factoryResult !== "object" ||
        factoryResult === null ||
        Array.isArray(factoryResult)
      ) {
        throw new Error(
          "q.dynamic factories must return a plain object describing the query"
        );
      }

      const shape: RuntimeNodeShape =
        isStaticQueryDefinition(factoryResult) ||
        isInfiniteQueryDefinition(factoryResult)
          ? (factoryResult.definition as RuntimeNodeShape)
          : (factoryResult as RuntimeNodeShape);

      return createNodeResult(key, shape);
    }) as unknown as AnyDynamicQueryStoreUnit;

    resultCallback.queryKey = key;

    return resultCallback;
  };

  const createStaticOrInfiniteValue = (
    key: readonly [...AnyQueryKey, string],
    definition: QueryFactorySchema[string]
  ) => {
    if (
      !(
        isStaticQueryDefinition(definition) ||
        isInfiniteQueryDefinition(definition)
      )
    ) {
      throw new Error(
        "Query definitions must be created with q.static or q.dynamic"
      );
    }

    return createNodeResult(key, definition.definition);
  };

  if (schema == null) {
    return omitPrototype(defKey);
  }

  const transformSchema = <$Factory extends QueryFactorySchema>(
    factory: $Factory,
    mainKey: AnyQueryKey
  ): TransformedSchemaMap<$Factory> => {
    type $FactoryProperty = keyof $Factory;

    const keys = assertSchemaKeys(factory);

    return keys.reduce<TransformedSchemaMap<$Factory>>(
      (factoryMap, factoryKey) => {
        const value = factory[factoryKey];
        if (value == null) {
          throw new Error(
            "Query definitions must be created with q.static or q.dynamic"
          );
        }
        const key = [...mainKey, factoryKey] as const;

        const transformedValue = isDynamicQueryDefinition(value)
          ? createDynamicCallback(key, value)
          : createStaticOrInfiniteValue(key, value);

        factoryMap.set(factoryKey as $FactoryProperty, transformedValue);
        return factoryMap;
      },
      new Map<$FactoryProperty, unknown>()
    );
  };

  const transformedSchema = transformSchema(
    schema as QueryFactorySchema,
    defKey.queryKey
  );

  return omitPrototype({
    ...Object.fromEntries(transformedSchema),
    ...defKey,
  });
}
