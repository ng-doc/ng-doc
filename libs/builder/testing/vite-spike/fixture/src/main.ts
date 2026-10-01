import { bootstrapApplication } from '@angular/platform-browser';

import { appProviders, FixtureRoot } from './app';
import { routes } from './generated/routes';
bootstrapApplication(FixtureRoot, { providers: appProviders })
  .then(() => {
    // Test readiness is published only after bootstrap in this document completes.
    document.body.setAttribute(
      'data-route-paths',
      JSON.stringify(routes.map((route) => route.path)),
    );
    document.body.setAttribute('data-bootstrapped', 'true');
  })
  .catch((error) => {
    console.error(error);
    document.body.setAttribute('data-bootstrap-error', String(error));
  });
