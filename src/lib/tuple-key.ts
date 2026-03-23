import type { KeyTuple } from "../types/core";

export const tupleKey = <const Values extends KeyTuple>(...values: Values) =>
  values;
