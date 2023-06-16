import {NgDocConfiguration} from '@ng-doc/builder';
import {ngKeywordsLoader} from '@ng-doc/keywords-loaders';

const NgDocConfig: NgDocConfiguration = {
	angularBuilder: 'webpack',
	pages: 'apps/ng-doc/src/app',
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
		},
	},
	guide: {
		anchorHeadings: ['h1', 'h2', 'h3', 'h4'],
	},
	sandbox: {
		stackblitz: {
			files: {
				'package.json': './sandbox/package.json',
			},
			dependencies: {
				'@ng-doc/ui-kit': 'latest',
				'@angular/cdk': '^16.0.0',
				'@ngneat/until-destroy': '9.2.0',
				'flex-controls': '2.0.1',
				'@tinkoff/ng-polymorpheus': '4.0.11',
			},
		},
		codesandbox: {
			files: {
				'package.json': './sandbox/package.json',
			},
			dependencies: {
				'@ng-doc/ui-kit': 'latest',
				'@angular/cdk': '^16.0.0',
				'@ngneat/until-destroy': '9.2.0',
				'flex-controls': '2.0.1',
				'@tinkoff/ng-polymorpheus': '4.0.11',
			},
		}
	},
};

export default NgDocConfig;
