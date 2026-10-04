import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Component } from '@angular/core';
import { provideRouter, RouterLink, RouterOutlet } from '@angular/router';
// A consumer application of the published packages, not builder code.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  NG_DOC_CONTEXT,
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NG_DOC_SHIKI_THEME,
  provideMainPageProcessor,
  provideNgDocApp,
  providePageSkeleton,
} from '@ng-doc/app';

import { routes } from './generated/routes';
@Component({
  selector: 'fixture-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template:
    '<nav><a routerLink="/first">First</a> <a routerLink="/second">Second</a></nav><router-outlet></router-outlet>',
})
export class FixtureRoot {}
export const appProviders = [
  provideRouter(routes),
  provideHttpClient(withInterceptorsFromDi()),
  ...provideNgDocApp(),
  ...providePageSkeleton({}),
  ...provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
  { provide: NG_DOC_CONTEXT, useValue: { navigation: [] } },
  { provide: NG_DOC_SHIKI_THEME, useValue: { light: 'github-light', dark: 'ayu-dark' } },
];
