export type AnyMutableOrReadonlyArray = unknown[] | readonly unknown[];

export type Tuple = [ValidValue | undefined, ...Array<ValidValue | undefined>];

export type KeyTuple = Tuple | Readonly<Tuple>;

export type ValidValue = string | number | boolean | object | bigint;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface DefinitionKey<Key extends AnyMutableOrReadonlyArray> {
  queryKey: readonly [...Key];
}
