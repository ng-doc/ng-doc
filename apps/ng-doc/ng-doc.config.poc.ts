import { NgDocConfiguration } from '@ng-doc/builder';
import { ngKeywordsLoader } from '@ng-doc/keywords-loaders';

const NgDocConfig: NgDocConfiguration = {
  docsPath: 'apps/ng-doc/poc',
  routePrefix: 'docs',
  tsConfig: 'apps/ng-doc/tsconfig.app.json',
  keywords: {
    loaders: [ngKeywordsLoader()],
  },
};

export default NgDocConfig;
