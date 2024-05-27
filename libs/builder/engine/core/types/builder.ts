import { Observable } from 'rxjs';

import { FileOutput } from './file-output';
import { BuilderState } from './state';

export type Builder<T> = Observable<BuilderState<T>>;

export interface BuilderSteps<T> {
  build: () => T;
  process?: (content: T) => T;
  postProcess?: (content: T) => T;
  toFileOutput: (content: T) => FileOutput;
}
