# {{ NgDocPage.title }}

This page contains information about migrating from previous versions of NgDoc to the current
version.

## Migration to >= v17.0

In v17.0.0, project was migrated to Angular v17, support of Webpack was removed, now it works only
with Vite + Esbuild. To migrate automatically, you can run the following command:

> **Note**
> After migration you also need to update other `@ng-doc/*` packages to v17.0.0

```bash group="migration-v17" name="Angular" icon="angular"
ng update @ng-doc/builder
```

```bash group="migration-v17" name="Nx" icon="nx"
nx migrate @ng-doc/builder
```

### Manual migration steps:

- replace `@ng-doc/builder:browser` builder for the build target with `@ng-doc/builder:application` builder
- rename `main` property in `angular.json` to `browser`
- covert `polyfills` property in `angular.json` to `polyfills` array
- remove `buildOptimizer` and `vendorChunk` properties from `angular.json`
- rename `buildTarget` properties in `angular.json` to `buildTarget`

Vite doesn't see changes in folders that start with a dot, so you need to rename `.ng-doc` folder:

- rename assets `.ng-doc/ng-doc/assets` folder to `ng-doc/ng-doc/assets` in `angular.json`
- change `@ng-doc/generated` path `.ng-doc/ng-doc/index.ts` in `tsconfig.json` to `ng-doc/ng-doc/index.ts`
- replace `.ng-doc` folder name in `.gitignore` file with `/ng-doc`

## Migration to >= v16.13

In v16.13.0 all NgModules were removed. Application configuration was changed.
This was done to simplify API and add more flexibility to the application, now Application will
use only components that YOU provided and nothing else which will reduce the size of the final
bundle for applications that don't use all features of NgDoc or want to customize it.

Now you can replace page components such as breadcrumbs, page navigation at the bottom of the page,
or table of contents with your own components, or even remove them completely.

NgDoc's schematics now also support standalone applications.

- `NgDocSidebarModule`, `NgDocNavbarModule` were removed, now you need to import
  `NgDocSidebarComponent`, `NgDocNavbarComponent`.
- `NgDocModule`, `NgDocUiKitRootModule` were removed, all configurations can
  be provided by using `provideNgDocApp` function.
- `NgDocGeneratedModule` was removed, now you need to use `provideNgDocContext` function to provide
  context of the generated documentation.
- `provideMainPageProcessor` and `providePageSkeleton` functions were added, now you must use them to
  provide default or your own page processors and page skeleton components.

Please see updated `*GettingStartedInstallation#configuring-application` articles for more information how your
application should be configured.

###

## Migrating to >= v16.3

In v16.3.0, new standalone pages were introduced. Now you don't need `ng-doc.dependencies.ts` file
or `NgModule` anymore, all dependencies can be imported directly in the `ng-doc.page.ts` file.

To migrate from previous versions, you need to run the following command:

```bash
ng g @ng-doc/builder:standalone-pages-migration
```

This command will remove `ng-doc.dependencies.ts` file and update all `ng-doc.page.ts` files
by importing all dependencies directly.
