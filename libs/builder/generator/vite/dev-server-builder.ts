import { createBuilder } from '@angular-devkit/architect';

import { type NgDocViteDevServerBuilderOptions, runViteDevServerBuilder } from './builders';

export default createBuilder<NgDocViteDevServerBuilderOptions>((options, context) =>
  runViteDevServerBuilder(options, context),
);
