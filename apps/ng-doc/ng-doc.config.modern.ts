import type { NgDocConfiguration } from '@ng-doc/builder';

import NgDocConfig from './ng-doc.config';

const ModernNgDocConfig: NgDocConfiguration = {
  ...NgDocConfig,
  // The documentation program maps `@ng-doc/generated` to a stub instead of the legacy output
  // (tsconfig.app.json), so the new engine's API pages do not depend on which builds ran before.
  tsConfig: 'apps/ng-doc/tsconfig.docs.json',
  outDir: 'ng-doc-modernization',
  cache: true,
};

export default ModernNgDocConfig;
