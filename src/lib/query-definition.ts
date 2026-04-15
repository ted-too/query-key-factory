import { omitPrototype } from "../internals/omit-prototype";
import type {
  DynamicQueryDefinition,
  StaticQueryDefinition,
  ValidateStaticDefinition,
} from "../types/query-store";

export const staticQuery = <const Shape extends Record<string, unknown>>(
  definition: Shape & ValidateStaticDefinition<Shape>
): StaticQueryDefinition<Shape> =>
  omitPrototype({
    _type: "static-query-definition",
    definition,
  }) as StaticQueryDefinition<Shape>;

export const dynamicQuery = <
  const Factory extends (
    ...args: readonly never[]
  ) => StaticQueryDefinition<Record<string, unknown>>,
>(
  definition: Factory &
    ((
      ...args: Parameters<Factory>
    ) => StaticQueryDefinition<Record<string, unknown>>)
): DynamicQueryDefinition<Factory> =>
  omitPrototype({
    _type: "dynamic-query-definition",
    definition,
  }) as DynamicQueryDefinition<Factory>;

export const isStaticQueryDefinition = (
  value: unknown
): value is StaticQueryDefinition<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  "_type" in value &&
  value._type === "static-query-definition";

export const isDynamicQueryDefinition = (
  value: unknown
): value is DynamicQueryDefinition<
  (...args: readonly never[]) => StaticQueryDefinition<Record<string, unknown>>
> =>
  typeof value === "object" &&
  value !== null &&
  "_type" in value &&
  value._type === "dynamic-query-definition";
