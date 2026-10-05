import {
  ApplicationConfig,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import type { NgDocDemoProvidersImport } from '@ng-doc/core/interfaces';

import { NgDocDemoHostComponent } from './demo-host.component';

/**
 * How the demo application starts.
 * @internal
 */
export interface ɵNgDocDemoApplicationOptions {
  /** Change detection with zone.js, when the application's polyfills load it. */
  readonly zone?: boolean;
  /**
   * Hydration of the server-rendered page: always on the server, which then writes the hydration
   * data, and in the browser only for a page the server rendered (a page without it, such as the
   * page of a demo that failed to prerender or the development server's, has nothing to hydrate).
   */
  readonly hydration?: boolean;
  /** Providers added after the others, for example server rendering. */
  readonly providers?: Array<Provider | EnvironmentProviders>;
}

/**
 * The configuration of the demo application: change detection, the router with the demo pages
 * (and a page for unknown demos), hydration, and the providers of `demoProviders`. The generated entries of
 * the demo application bootstrap `NgDocDemoAppComponent` with it, in the browser and on the server.
 * @param routes - The generated demo routes.
 * @param demoProviders - The generated import of the `demoProviders` module, if any.
 * @param options - How the application starts.
 * @internal
 */
export async function ɵngDocDemoApplicationConfig(
  routes: Routes,
  demoProviders: NgDocDemoProvidersImport | undefined,
  options: ɵNgDocDemoApplicationOptions = {},
): Promise<ApplicationConfig> {
  const providers = demoProviders ? (await demoProviders()).default : [];

  return {
    providers: [
      options.zone ? provideZoneChangeDetection() : provideZonelessChangeDetection(),
      ...(options.hydration ? [provideClientHydration(withNoIncrementalHydration())] : []),
      provideRouter([...routes, { path: '**', component: NgDocDemoHostComponent }]),
      ...providers,
      ...(options.providers ?? []),
    ],
  };
}
