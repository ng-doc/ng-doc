import {NgDocConfiguration} from '@ng-doc/builder';
import {ngKeywordsLoader} from '@ng-doc/keywords-loaders';

const NgDocConfig: NgDocConfiguration = {
	angularBuilder: 'webpack',
	pages: 'apps/ng-doc/docs',
	routePrefix: 'docs',
	tsConfig: 'apps/ng-doc/tsconfig.app.json',
	cache: false,
	repoConfig: {
		url: 'https://github.com/ng-doc/ng-doc',
		mainBranch: 'main',
		releaseBranch: 'release',
	},
	keywords: {
		loaders: [ngKeywordsLoader()],
		keywords: {
			nunjucks: {
				url: 'https://mozilla.github.io/nunjucks/',
			},
			tsdoc: {
				title: 'TsDoc',
				url: 'https://tsdoc.org/',
			},
			highlightjs: {
				title: 'highlight.js',
				url: 'https://highlightjs.org/',
			},
			githubSlugger: {
				title: 'github-slugger',
				url: 'https://github.com/Flet/github-slugger',
			},
			ngDocFeatureRequest: {
				title: 'NgDoc Feature Request',
				url: 'https://github.com/ng-doc/ng-doc/issues/new?assignees=skoropadas&labels=Type%3A+Enhancement&template=feature_request.yaml&title=%5BFeature%5D+',
			},
			ngDocBugReport: {
				title: 'NgDoc Bug Report',
				url: 'https://github.com/ng-doc/ng-doc/issues/new?assignees=skoropadas&labels=Type%3A+Bug&projects=&template=bug_report.yaml&title=%5BBug%5D+',
			},
			featherIcons: {
				title: 'Feather Icons Pack',
				url: 'https://feathericons.com/',
			},
		},
	},
	guide: {
		anchorHeadings: ['h1', 'h2', 'h3', 'h4'],
	},
};

export default NgDocConfig;
