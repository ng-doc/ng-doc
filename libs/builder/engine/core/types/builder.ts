import { Observable } from 'rxjs';

import { BuilderState } from './state';

export type Builder<T> = Observable<BuilderState<T>>;
