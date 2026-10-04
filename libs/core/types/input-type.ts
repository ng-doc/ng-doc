import { InputSignalWithTransform } from '@angular/core';

/**
 * The value an input `K` of `T` accepts. For a signal input (`input()`, a required input or
 * `model()`) this is the type it is set with, before its transform (for example `unknown` for an
 * input with `numberAttribute`); for a decorator input it is the property type. An optional signal
 * input of an interface, such as a field of a type control, resolves the same way.
 */
export type InputType<T, K extends keyof T> =
  // The read type sits in contravariant positions of the input signal, so only `any` matches
  // every input here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NonNullable<T[K]> extends InputSignalWithTransform<any, infer TWrite> ? TWrite : T[K];
