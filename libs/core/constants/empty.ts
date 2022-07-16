import {Observable, of} from 'rxjs';

export const EMPTY_ARRAY: [] = [];
export const EMPTY_MAP: Map<never, never> = new Map<never, never>();
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const EMPTY_FUNCTION: () => void = () => {};
export const EMPTY_OBSERVABLE: Observable<void> = of(void 0);
