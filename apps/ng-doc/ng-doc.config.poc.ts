import { NgDocConfiguration } from '@ng-doc/builder';

const NgDocConfig: NgDocConfiguration = {
  docsPath: 'apps/ng-doc/poc',
  routePrefix: 'docs',
  tsConfig: 'apps/ng-doc/tsconfig.app.json',
  cache: false,
};

export default NgDocConfig;
