import { createBuilder } from '@angular-devkit/architect';

import { angularAdapterDependencies } from '../dependencies';
import { runModernDevServer } from '../runner';
import type { ModernDevServerBuilderOptions } from '../types';

export const runDevServer = (
  options: ModernDevServerBuilderOptions,
  context: Parameters<typeof runModernDevServer>[1],
) => runModernDevServer(options, context, angularAdapterDependencies);

export default createBuilder(runDevServer);
