export const GENERATED_PATH: string = '@ng-doc/generated';

export interface EntityImport {
  name: string;
  path: string;
}

/**
 * One entry that `ng add` puts into an `imports` or `providers` array.
 *
 * An array entry is matched by its function or identifier name (the text of `initializer` before
 * its first `(`). When the application already has such an entry, `ng add` extends it with
 * `routes`, `features` and `options` instead of adding a second one, so the router and the HTTP
 * client are never registered twice and a second `ng add` run changes nothing.
 */
export interface ImportConstant {
  /** Expression added when the array has no entry with the same name yet. */
  initializer: string;
  /** Named imports that the expression needs. */
  imports: EntityImport[];
  /** Routes that the first argument of an existing call must include. */
  routes?: string;
  /** Feature calls that an existing call must pass, matched by their function name. */
  features?: string[];
  /** Properties that the options object (second argument) of an existing call must set. */
  options?: Array<[name: string, initializer: string]>;
}

export interface AppImports {
  imports: ImportConstant[];
  providers: ImportConstant[];
}

export const NG_DOC_COMPONENT_IMPORTS: ImportConstant[] = [
  {
    initializer: 'NgDocRootComponent',
    imports: [{ name: 'NgDocRootComponent', path: '@ng-doc/app' }],
  },
  {
    initializer: 'NgDocNavbarComponent',
    imports: [{ name: 'NgDocNavbarComponent', path: '@ng-doc/app' }],
  },
  {
    initializer: 'NgDocSidebarComponent',
    imports: [{ name: 'NgDocSidebarComponent', path: '@ng-doc/app' }],
  },
];

/*
 * No change-detection provider on purpose: NgDoc works with and without zone.js, so `ng add`
 * keeps whatever the application uses (zoneless by default since Angular 21). No `withFetch()`
 * either: the fetch backend is the default since Angular 22 and the feature is deprecated.
 */
const NG_DOC_PROVIDERS: ImportConstant[] = [
  {
    initializer: 'provideHttpClient(withInterceptorsFromDi())',
    imports: [
      { name: 'provideHttpClient', path: '@angular/common/http' },
      { name: 'withInterceptorsFromDi', path: '@angular/common/http' },
    ],
    // NgDoc registers class-based interceptors through `HTTP_INTERCEPTORS`.
    features: ['withInterceptorsFromDi()'],
  },
  {
    initializer: 'provideNgDocContext()',
    imports: [{ name: 'provideNgDocContext', path: GENERATED_PATH }],
  },
  {
    initializer: 'provideNgDocApp()',
    imports: [{ name: 'provideNgDocApp', path: '@ng-doc/app' }],
  },
  {
    initializer: 'provideSearchEngine(NgDocDefaultSearchEngine)',
    imports: [
      { name: 'provideSearchEngine', path: '@ng-doc/app' },
      { name: 'NgDocDefaultSearchEngine', path: '@ng-doc/app' },
    ],
  },
  {
    initializer: 'providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON)',
    imports: [
      { name: 'providePageSkeleton', path: '@ng-doc/app' },
      { name: 'NG_DOC_DEFAULT_PAGE_SKELETON', path: '@ng-doc/app' },
    ],
  },
  {
    initializer: 'provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)',
    imports: [
      { name: 'provideMainPageProcessor', path: '@ng-doc/app' },
      { name: 'NG_DOC_DEFAULT_PAGE_PROCESSORS', path: '@ng-doc/app' },
    ],
  },
];

export const MODULE_APP: AppImports = {
  imports: [
    {
      initializer:
        "RouterModule.forRoot(NG_DOC_ROUTING, {scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled', scrollOffset: [0, 70]})",
      imports: [
        { name: 'RouterModule', path: '@angular/router' },
        {
          name: 'NG_DOC_ROUTING',
          path: GENERATED_PATH,
        },
      ],
      routes: 'NG_DOC_ROUTING',
      options: [
        ['scrollPositionRestoration', "'enabled'"],
        ['anchorScrolling', "'enabled'"],
        ['scrollOffset', '[0, 70]'],
      ],
    },
    ...NG_DOC_COMPONENT_IMPORTS,
  ],
  providers: NG_DOC_PROVIDERS,
};

/**
 * Features that earlier versions of `ng add` added and that are deprecated now. They are dropped
 * when `ng add` merges the duplicate calls those versions left behind; a call that the
 * application wrote itself keeps them.
 */
export const DROPPED_FEATURES: string[] = ['withFetch'];

const IN_MEMORY_SCROLLING: string =
  'withInMemoryScrolling({scrollPositionRestoration: "enabled", anchorScrolling: "enabled"})';

export const STANDALONE_APP: AppImports = {
  imports: NG_DOC_COMPONENT_IMPORTS,
  providers: [
    {
      initializer: `provideRouter(NG_DOC_ROUTING, ${IN_MEMORY_SCROLLING})`,
      imports: [
        { name: 'provideRouter', path: '@angular/router' },
        { name: 'NG_DOC_ROUTING', path: GENERATED_PATH },
        { name: 'withInMemoryScrolling', path: '@angular/router' },
      ],
      routes: 'NG_DOC_ROUTING',
      features: [IN_MEMORY_SCROLLING],
    },
    ...NG_DOC_PROVIDERS,
  ],
};
