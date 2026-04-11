import type { QueryFunction } from "@tanstack/query-core";
import { assertSchemaKeys } from "../internals/assert-schema-keys";
import { omitPrototype } from "../internals/omit-prototype";
import type { AnyMutableOrReadonlyArray, DefinitionKey } from "../types/core";
import type {
  AnyDynamicQueryStoreUnit,
  AnyQueryKey,
  QueryFactorySchema,
  QueryStoreUnit,
  QueryStoreUnitFromSchema,
  ValidateFactory,
} from "../types/query-store";

interface RuntimeFactoryObject {
  queryFn?: QueryFunction;
  queryKey?: AnyMutableOrReadonlyArray | null;
  [key: string]: unknown;
}

type RuntimeDynamicFactoryObject = Omit<RuntimeFactoryObject, "queryKey"> & {
  queryKey: AnyMutableOrReadonlyArray;
};

type RuntimeStaticFactoryValue = Exclude<
  QueryFactorySchema[string],
  (...args: readonly never[]) => unknown
>;

type RuntimeFactoryCallback = (
  ...args: readonly never[]
) => AnyMutableOrReadonlyArray | RuntimeDynamicFactoryObject;

type TransformedSchemaMap<Schema extends QueryFactorySchema> = Map<
  keyof Schema,
  unknown
>;

const isReadonlyArray = (arg: unknown): arg is AnyMutableOrReadonlyArray =>
  Array.isArray(arg);

const RESERVED_FACTORY_KEYS = new Set(["queryKey", "queryFn"]);

const hasQueryFn = (
  value: RuntimeFactoryObject
): value is RuntimeFactoryObject & { queryFn: QueryFunction } =>
  value.queryFn != null;

const isNestedQueryValue = (
  value: unknown
): value is QueryFactorySchema[string] =>
  value == null ||
  Array.isArray(value) ||
  typeof value === "function" ||
  typeof value === "object";

const getNestedQueries = (
  value: RuntimeFactoryObject
): QueryFactorySchema | undefined => {
  const nestedEntries = Object.entries(value).filter(
    ([key, entryValue]) =>
      !RESERVED_FACTORY_KEYS.has(key) && isNestedQueryValue(entryValue)
  );

  if (nestedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(nestedEntries) as QueryFactorySchema;
};

export function createQueryKeys<Key extends string>(
  queryDef: Key
): QueryStoreUnit<Key>;
export function createQueryKeys<
  Key extends string,
  const Schema extends QueryFactorySchema,
>(
  queryDef: Key,
  schema: ValidateFactory<Schema>
): QueryStoreUnitFromSchema<Key, Schema>;
export function createQueryKeys<
  Key extends string,
  const Schema extends QueryFactorySchema,
>(
  queryDef: Key,
  schema?: ValidateFactory<Schema>
): QueryStoreUnit<Key> | QueryStoreUnitFromSchema<Key, Schema> {
  const defKey: DefinitionKey<[Key]> = {
    _def: [queryDef] as const,
  };

  const createNestedEntries = (
    nestedQueries: QueryFactorySchema,
    key: AnyQueryKey
  ) => omitPrototype(Object.fromEntries(transformSchema(nestedQueries, key)));

  const createDynamicResult = (
    key: readonly [...AnyQueryKey, string],
    result: RuntimeDynamicFactoryObject
  ) => {
    const innerKey = [...key, ...result.queryKey] as const;
    const nestedQueries = getNestedQueries(result);
    const nestedEntries =
      nestedQueries == null
        ? undefined
        : createNestedEntries(nestedQueries, innerKey);

    if (hasQueryFn(result)) {
      const queryOptions = {
        queryKey: innerKey,
        queryFn: result.queryFn,
      };

      return omitPrototype({
        ...nestedEntries,
        ...queryOptions,
      });
    }

    return omitPrototype({
      ...nestedEntries,
      queryKey: innerKey,
    });
  };

  const createDynamicCallback = (
    key: readonly [...AnyQueryKey, string],
    value: RuntimeFactoryCallback
  ) => {
    const resultCallback = ((...args: readonly unknown[]) => {
      const result = (
        value as unknown as (
          ...callbackArgs: readonly unknown[]
        ) => AnyMutableOrReadonlyArray | RuntimeDynamicFactoryObject
      )(...args);

      if (isReadonlyArray(result)) {
        return omitPrototype({
          queryKey: [...key, ...result] as const,
        });
      }

      return createDynamicResult(key, result);
    }) as unknown as AnyDynamicQueryStoreUnit;

    resultCallback._def = key;

    return resultCallback;
  };

  const createStaticValue = (
    key: readonly [...AnyQueryKey, string],
    value: RuntimeStaticFactoryValue
  ) => {
    if (value == null) {
      return omitPrototype({
        queryKey: key,
      });
    }

    if (isReadonlyArray(value)) {
      return omitPrototype({
        _def: key,
        queryKey: [...key, ...value] as const,
      });
    }

    const innerDefKey = { ...(value.queryKey ? { _def: key } : undefined) };
    const innerKey = [...key, ...(value.queryKey ?? [])] as const;
    const nestedQueries = getNestedQueries(value);
    const nestedEntries =
      nestedQueries == null
        ? undefined
        : createNestedEntries(nestedQueries, innerKey);

    if (hasQueryFn(value)) {
      const queryOptions = {
        queryKey: innerKey,
        queryFn: value.queryFn,
      };

      return omitPrototype({
        ...innerDefKey,
        ...nestedEntries,
        ...queryOptions,
      });
    }

    return omitPrototype({
      ...innerDefKey,
      ...nestedEntries,
      queryKey: innerKey,
    });
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
        const key = [...mainKey, factoryKey] as const;

        const transformedValue =
          typeof value === "function"
            ? createDynamicCallback(
                key,
                value as unknown as RuntimeFactoryCallback
              )
            : createStaticValue(key, value as RuntimeStaticFactoryValue);

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
