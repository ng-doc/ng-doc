import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';

import { appConfig, hydrationProviders } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(), hydrationProviders],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
