import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'NgDoc API',
  keyword: 'ApiReferences',
  // The API page has no category: a category would move its list route away from `/docs/api`.
  // `order` places it after the Reference category in the sidebar.
  order: 9,
  scopes: [
    {
      name: '@ng-doc/app',
      route: 'app',
      include: 'libs/app/**/*.ts',
      exclude: [
        // Test files and the test runner's configuration.
        'libs/app/testing/**',
        'libs/app/**/*.spec.ts',
        'libs/app/*.config.ts',
        'libs/app/test-setup.ts',
        // Internal helpers of the page and header components and of the generated page routes,
        // exported only across entry points.
        'libs/app/helpers/content-preload.ts',
        'libs/app/helpers/hydration-snapshot.ts',
        'libs/app/helpers/page-url.ts',
        // The bootstrap and the iframe messages of the demo application, which generated code and
        // the demo frame use.
        'libs/app/demo-app/demo-application.ts',
        'libs/app/demo-app/demo-message.ts',
      ],
    },
    {
      name: '@ng-doc/builder',
      route: 'builder',
      // Public interfaces only: the configuration, shared types, schematic options and the
      // template globals (`NgDocActions`, `NgDocApi`, `JSDoc`). Engine internals stay out.
      include: [
        'libs/builder/interfaces/**.ts',
        'libs/builder/types/**.ts',
        'libs/builder/schematics/*/schema.ts',
        'libs/builder/engine/nunjucks/actions.ts',
        'libs/builder/engine/nunjucks/api.ts',
        'libs/builder/engine/nunjucks/js-doc.ts',
      ],
      exclude: ['libs/builder/**/**.spec.ts'],
    },
    {
      name: '@ng-doc/ui-kit',
      route: 'ui-kit',
      include: 'libs/ui-kit/**/*.ts',
      exclude: [
        'libs/ui-kit/testing/**',
        'libs/ui-kit/**/*.spec.ts',
        'libs/ui-kit/*.config.ts',
        'libs/ui-kit/test-setup.ts',
      ],
    },
    {
      name: '@ng-doc/core',
      route: 'core',
      include: 'libs/core/**/*.ts',
      exclude: ['libs/core/**/*.spec.ts', 'libs/core/*.config.ts'],
    },
    {
      name: '@ng-doc/keywords-loaders',
      route: 'keywords-loaders',
      include: 'libs/keywords-loaders/index.ts',
    },
  ],
};

export default api;
