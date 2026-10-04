---
keyword: OlderVersionsPage
---

Migration notes for NgDoc versions before 22.0. Apply them in order, one major version at a time:
for example, update to 17 first, then to 18.
For 22.0, see `*UpgradeTo22Page`.

## Migrate to 18.0

NgDoc 18 has migrations that update your documentation. Run:

```bash group="migration-v18" name="Angular CLI" icon="angular"
ng update @ng-doc/builder@18
```

```bash group="migration-v18" name="Nx" icon="nx"
nx migrate @ng-doc/builder@18
```

Then update the other `@ng-doc/*` packages to 18.0 as well.

The migration:

- moves `keyword` from `ng-doc.page.ts` to the front matter of the page's Markdown file;
- removes `# {{ '{{ NgDocPage.title }}' | safe }}` from Markdown files, because the page title is now
  shown by default.

## Migrate to 17.0

NgDoc 17 moved to Angular 17 and dropped Webpack: it works only with the Vite and esbuild based
builders. To migrate automatically, run:

```bash group="migration-v17" name="Angular CLI" icon="angular"
ng update @ng-doc/builder@17
```

```bash group="migration-v17" name="Nx" icon="nx"
nx migrate @ng-doc/builder@17
```

Then update the other `@ng-doc/*` packages to 17.0 as well.

To migrate by hand, change the build configuration in `angular.json`:

- replace the `@ng-doc/builder:browser` builder of the `build` target with
  `@ng-doc/builder:application`;
- rename the `main` option to `browser`;
- turn the `polyfills` option into an array;
- remove the `buildOptimizer` and `vendorChunk` options;
- rename the `browserTarget` options to `buildTarget`.

Vite doesn't see changes in folders whose name starts with a dot, so rename the `.ng-doc` folder:

- in `angular.json`, change the assets input `.ng-doc/<project-name>/assets` to
  `ng-doc/<project-name>/assets`;
- in `tsconfig.json`, change the `@ng-doc/generated` path `.ng-doc/<project-name>/index.ts` to
  `ng-doc/<project-name>/index.ts`;
- in `.gitignore`, replace `.ng-doc` with `/ng-doc`.

## Migrate to 16.13

NgDoc 16.13 removed all NgModules. The application uses only the components and providers that you
provide, so you can replace or remove page parts such as breadcrumbs, page navigation and the table
of contents.

- `NgDocSidebarModule` and `NgDocNavbarModule` were removed. Import `NgDocSidebarComponent` and
  `NgDocNavbarComponent` instead.
- `NgDocModule` and `NgDocUiKitRootModule` were removed. Configure the application with
  `provideNgDocApp`.
- `NgDocGeneratedModule` was removed. Provide the generated context with `provideNgDocContext()`.
- `provideMainPageProcessor` and `providePageSkeleton` were added. Use them to provide the default
  or your own page processors and page skeleton.

`*InstallationPage#4-add-the-providers` shows the current provider setup.

## Migrate to 16.3

NgDoc 16.3 introduced standalone pages. Pages no longer need an `ng-doc.dependencies.ts` file or an
NgModule: import dependencies directly in `ng-doc.page.ts`. To migrate, run:

```bash
ng g @ng-doc/builder:standalone-pages-migration
```

The command removes the `ng-doc.dependencies.ts` files and moves their imports into the
`ng-doc.page.ts` files.

{% index false %}

## Related

- `*UpgradeTo22Page`
- `*LegacyBuildersPage`

{% endindex %}

Next: `*ConfigurationReference`
