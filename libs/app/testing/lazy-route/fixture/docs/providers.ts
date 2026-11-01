import { EnvironmentProviders, Provider } from '@angular/core';
import {
  NG_DOC_CONTEXT,
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NG_DOC_DEFAULT_PAGE_SKELETON,
  NG_DOC_ROUTE_PREFIX,
  NG_DOC_SHIKI_THEME,
  NgDocDefaultSearchEngine,
  provideMainPageProcessor,
  provideNgDocApp,
  providePageSkeleton,
  provideSearchEngine,
} from '@ng-doc/app';

/**
 * What `provideNgDocContext()` of `@ng-doc/generated` provides for a site with one page under
 * `/docs`: the fixture has no generated folder.
 */
function provideFixtureContext(): Provider[] {
  return [
    {
      provide: NG_DOC_CONTEXT,
      useValue: { navigation: [{ title: 'Guide', route: '/docs/guide', hidden: false }] },
    },
    { provide: NG_DOC_ROUTE_PREFIX, useValue: 'docs' },
    { provide: NG_DOC_SHIKI_THEME, useValue: { light: 'github-light', dark: 'ayu-dark' } },
  ];
}

/** The NgDoc providers, given to the lazy route that holds the documentation. */
export function provideFixtureDocs(): Array<Provider | EnvironmentProviders> {
  return [
    provideFixtureContext(),
    provideNgDocApp({ contentAnchorScrolling: true, contentScrollPositionRestoration: 'enabled' }),
    provideSearchEngine(NgDocDefaultSearchEngine),
    providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
    provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
  ];
}
