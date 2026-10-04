import { NgDocConfiguration } from '@ng-doc/builder';
import { ngKeywordsLoader } from '@ng-doc/keywords-loaders';

const NgDocConfig: NgDocConfiguration = {
  docsPath: 'apps/ng-doc/poc',
  routePrefix: 'docs',
  tsConfig: 'apps/ng-doc/tsconfig.legacy.json',
  cache: false,
  // Served by `serve-legacy:poc`, whose build reads the legacy output (tsconfig.legacy.json).
  outDir: 'ng-doc-legacy',
  keywords: {
    loaders: [ngKeywordsLoader()],
  },
};

export default NgDocConfig;
