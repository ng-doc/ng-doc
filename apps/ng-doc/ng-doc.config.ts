import { NgDocConfiguration } from '@ng-doc/builder';
import { ngKeywordsLoader, rxjsKeywordsLoader } from '@ng-doc/keywords-loaders';

const NgDocConfig: NgDocConfiguration = {
  docsPath: 'apps/ng-doc/docs',
  routePrefix: 'docs',
  tsConfig: 'apps/ng-doc/tsconfig.app.json',
  cache: false,
  repoConfig: {
    url: 'https://github.com/ng-doc/ng-doc',
    mainBranch: 'main',
    releaseBranch: 'release',
  },
  keywords: {
    loaders: [ngKeywordsLoader(), rxjsKeywordsLoader()],
    keywords: {
      nunjucks: {
        url: 'https://mozilla.github.io/nunjucks/',
      },
      mermaid: {
        url: 'https://mermaid.js.org/',
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
      // The Angular loader (Signal Forms) and the RxJS loader both define these names; choose the
      // RxJS operators explicitly, so the link does not depend on the order of the loaders.
      ...Object.fromEntries(
        ['debounce', 'max', 'min'].map((name) => [
          name,
          {
            url: `https://rxjs.dev/api/operators/${name}`,
            description: 'External link to the RxJS documentation.',
          },
        ]),
      ),
      // Names that an API page here shares with another export: Angular's `createComponent` and
      // `extractValue`, the `asArray` pipe, and the `NgDocApi` template global. Each is pinned to the
      // page it links to; a url that is the route of an API page picks that page.
      createComponent: { url: '/docs/api/functions/app/createComponent' },
      extractValue: { url: '/docs/api/functions/core/extractValue' },
      asArray: { url: '/docs/api/functions/core/asArray' },
      NgDocApi: { url: '/docs/api/interfaces/core/NgDocApi' },
    },
  },
  guide: {
    anchorHeadings: ['h1', 'h2', 'h3', 'h4'],
  },
};

export default NgDocConfig;
