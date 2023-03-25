import {NgDocConfiguration} from '@ng-doc/builder';

const NgDocConfig: NgDocConfiguration = {
	pages: 'apps/ng-doc/src/poc',
	tsConfig: 'apps/ng-doc/tsconfig.app.json',
	repoConfig: {
		url: 'https://github.com/skoropadas/ng-doc',
		mainBranch: 'main',
		releaseBranch: 'release',
	},
	keywords: {
		nunjucks: {
			path: 'https://mozilla.github.io/nunjucks/',
		},
		tsdoc: {
			title: 'TsDoc',
			path: 'https://tsdoc.org/',
		},
		highlightjs: {
			title: 'highlight.js',
			path: 'https://highlightjs.org/',
		},
		ngDocFeatureRequest: {
			title: 'NgDoc Feature Request',
			path: 'https://github.com/skoropadas/ng-doc/issues/new?assignees=skoropadas&labels=Type%3A+Enhancement&template=feature_request.yaml&title=%5BFeature%5D+',
		},
	},
	guide: {
		anchorHeadings: ['h1', 'h2', 'h3', 'h4'],
	},
};

export default NgDocConfig;
