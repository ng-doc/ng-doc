import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';

import { appProviders, FixtureRoot } from './app';
export async function render(url: string) {
  return renderApplication(
    (context) =>
      bootstrapApplication(
        FixtureRoot,
        { providers: [...appProviders, provideServerRendering()] },
        context,
      ),
    {
      document:
        '<!doctype html><html><head><base href="/"></head><body><fixture-root></fixture-root></body></html>',
      url,
      allowedHosts: ['127.0.0.1'],
    },
  );
}
