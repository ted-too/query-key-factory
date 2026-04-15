import { assertSchemaKeys } from "../internals/assert-schema-keys";
import { omitPrototype } from "../internals/omit-prototype";
import type { AnyMutableOrReadonlyArray, DefinitionKey } from "../types/core";
import type {
  AnyDynamicQueryStoreUnit,
  AnyQueryKey,
  QueryFactorySchema,
  QueryStoreUnit,
  QueryStoreUnitFromSchema,
  StaticQueryDefinition,
  ValidateFactory,
} from "../types/query-store";
import {
  isDynamicQueryDefinition,
  isStaticQueryDefinition,
} from "./query-definition";

type RuntimeNodeShape = Record<string, unknown>;

type TransformedSchemaMap<Schema extends QueryFactorySchema> = Map<
  keyof Schema,
  unknown
>;

const isReadonlyArray = (arg: unknown): arg is AnyMutableOrReadonlyArray =>
  Array.isArray(arg);

const getNestedQueries = (
  definition: RuntimeNodeShape
): QueryFactorySchema | undefined => {
  const nestedEntries = Object.entries(definition).filter(
    ([, value]) =>
      isStaticQueryDefinition(value) || isDynamicQueryDefinition(value)
  );

  if (nestedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(nestedEntries) as QueryFactorySchema;
};

const getQueryOptions = (definition: RuntimeNodeShape): RuntimeNodeShape =>
  Object.fromEntries(
    Object.entries(definition).filter(
      ([, value]) =>
        !(isStaticQueryDefinition(value) || isDynamicQueryDefinition(value))
    )
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
    _def: [queryDef] as const,
  };

  const createNestedEntries = (
    nestedQueries: QueryFactorySchema,
    key: AnyQueryKey
  ) => omitPrototype(Object.fromEntries(transformSchema(nestedQueries, key)));

  const createStaticResult = (
    key: readonly [...AnyQueryKey, string],
    node: StaticQueryDefinition<Record<string, unknown>>,
    includeDefinitionKey: boolean
  ) => {
    const options = getQueryOptions(node.definition);
    const suffix = options.queryKey;
    const innerKey = [
      ...key,
      ...(isReadonlyArray(suffix) ? suffix : []),
    ] as const;
    const nestedQueries = getNestedQueries(node.definition);
    const nestedEntries =
      nestedQueries == null
        ? undefined
        : createNestedEntries(nestedQueries, innerKey);
    const { queryKey: _queryKey, ...restOptions } = options;
    const definitionEntry =
      includeDefinitionKey && isReadonlyArray(suffix)
        ? { _def: key }
        : undefined;

    return omitPrototype({
      ...definitionEntry,
      ...nestedEntries,
      ...restOptions,
      queryKey: innerKey,
    });
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

      const result = (
        definition.definition as (
          ...callbackArgs: readonly unknown[]
        ) => StaticQueryDefinition<Record<string, unknown>>
      )(...args);

      if (!isStaticQueryDefinition(result)) {
        throw new Error("Dynamic query definitions must return q.static(...)");
      }

      return createStaticResult(key, result, false);
    }) as unknown as AnyDynamicQueryStoreUnit;

    resultCallback._def = key;

    return resultCallback;
  };

  const createStaticValue = (
    key: readonly [...AnyQueryKey, string],
    definition: QueryFactorySchema[string]
  ) => {
    if (!isStaticQueryDefinition(definition)) {
      throw new Error("Static query definitions must be created with q.static");
    }

    return createStaticResult(key, definition, true);
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
          : createStaticValue(key, value);

        factoryMap.set(factoryKey as $FactoryProperty, transformedValue);
        return factoryMap;
      },
      new Map<$FactoryProperty, unknown>()
    );
  };

  const transformedSchema = transformSchema(
    schema as QueryFactorySchema,
    defKey._def
  );

  return omitPrototype({
    ...Object.fromEntries(transformedSchema),
    ...defKey,
  });
}
