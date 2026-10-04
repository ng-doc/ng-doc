import type { NgDocConfiguration } from '@ng-doc/builder';

import NgDocConfig from './ng-doc.config';

// The site on the legacy builders (`build-legacy`, `serve-legacy`). Its generated files go to
// `ng-doc-legacy/`, so they never mix with the Vite engine's output in `ng-doc/`.
const LegacyNgDocConfig: NgDocConfiguration = {
  ...NgDocConfig,
  tsConfig: 'apps/ng-doc/tsconfig.legacy.json',
  cache: false,
  outDir: 'ng-doc-legacy',
};

export default LegacyNgDocConfig;
