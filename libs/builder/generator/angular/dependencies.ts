import { buildApplication, executeDevServerBuilder } from '@angular/build';

import { createGeneratorBuildSession } from '../bootstrap';
import { createParcelEventSource } from '../session/parcel-event-source';
import { createThemeIndexTransformer } from './index-transform';
import type { AngularAdapterDependencies } from './types';

/** Public Angular root API boundary. Direct use is experimental in Angular 22. */
export const angularAdapterDependencies: AngularAdapterDependencies = {
  createSession: createGeneratorBuildSession,
  createEventSource: createParcelEventSource,
  createIndexHtmlTransformer: createThemeIndexTransformer,
  buildApplication,
  executeDevServer: executeDevServerBuilder,
};
