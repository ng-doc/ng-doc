import {
  ApplicationConfig,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import type { NgDocDemoProvidersImport } from '@ng-doc/core/interfaces';

import { NgDocDemoHostComponent } from './demo-host.component';

/** How the demo application starts. */
export interface ɵNgDocDemoApplicationOptions {
  /** Change detection with zone.js, when the application's polyfills load it. */
  readonly zone?: boolean;
  /** Providers added after the others, for example server rendering. */
  readonly providers?: Array<Provider | EnvironmentProviders>;
}

/**
 * The configuration of the demo application: change detection, the router with the demo pages
 * (and a page for unknown demos), and the providers of `demoProviders`. The generated entries of
 * the demo application bootstrap `NgDocDemoAppComponent` with it, in the browser and on the server.
 * @param routes - The generated demo routes.
 * @param demoProviders - The generated import of the `demoProviders` module, if any.
 * @param options - How the application starts.
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
      provideRouter([...routes, { path: '**', component: NgDocDemoHostComponent }]),
      ...providers,
      ...(options.providers ?? []),
    ],
  };
}
