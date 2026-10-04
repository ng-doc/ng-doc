import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { withNgDocContentReady } from '@ng-doc/app/helpers';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(
    AppComponent,
    { ...config, providers: [provideZonelessChangeDetection(), ...config.providers] },
    context,
  );
export default withNgDocContentReady(bootstrap);
