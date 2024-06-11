import { InputSignal } from '@angular/core';

export type InputType<T, K extends keyof T> = T[K] extends InputSignal<infer R> ? R : T[K];
