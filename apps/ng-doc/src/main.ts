import { enableProdMode, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig, hydrationProviders } from './app/app.config';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// A server-rendered document carries the serialized application state in
// `<script id="${APP_ID}-state">`. The site keeps Angular's default `APP_ID`, `ng`, and APP_ID can
// only be read after bootstrap, so the id is written out here; set both together if that changes.
const serverRendered = document.getElementById('ng-state') !== null;

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    provideZonelessChangeDetection(),
    ...(serverRendered ? [hydrationProviders] : []),
    ...appConfig.providers,
  ],
}).catch((err: unknown) => console.error(err));
