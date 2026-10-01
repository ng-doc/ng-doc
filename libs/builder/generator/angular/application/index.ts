import { createBuilder } from '@angular-devkit/architect';

import { angularAdapterDependencies } from '../dependencies';
import { runModernApplication } from '../runner';
import type { ModernApplicationBuilderOptions } from '../types';

export const runApplication = (
  options: ModernApplicationBuilderOptions,
  context: Parameters<typeof runModernApplication>[1],
) => runModernApplication(options, context, angularAdapterDependencies);

export default createBuilder(runApplication);
