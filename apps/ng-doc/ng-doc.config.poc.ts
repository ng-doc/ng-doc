import { NgDocConfiguration } from '@ng-doc/builder';

const NgDocConfig: NgDocConfiguration = {
	angularBuilder: 'webpack',
	pages: 'apps/ng-doc/poc',
	routePrefix: 'docs',
	tsConfig: 'apps/ng-doc/tsconfig.app.json',
};

export default NgDocConfig;
