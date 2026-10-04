import { createBuilder } from '@angular-devkit/architect';

import { type NgDocViteApplicationBuilderOptions, viteApplicationBuilderOutputs } from './builders';

export default createBuilder<NgDocViteApplicationBuilderOptions>((options, context) =>
  viteApplicationBuilderOutputs(options, context),
);
