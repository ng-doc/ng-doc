# {{ NgDocPage.title }}

This page contains information about migrating from previous versions of NgDoc to the current
version.

## Migration to >= v16.12

In v16.12.0 all NgModules were removed. Application configuration was also simplified and changed.
This was done to simplify API and add more flexibility to the application, now Application will
use only components that YOU provided and nothing else which will reduce the size of the final
bundle for applications that don't use all features of NgDoc or want to customize it.

- `NgDocSidebarModule`, `NgDocNavbarModule` were removed, now you need to import
  `NgDocSidebarComponent`, `NgDocNavbarComponent`.
- `NgDocModule`, `NgDocUiKitRootModule`, `provideSearchEngine` were removed, all configurations can
  be provided by using
  `provideNgDocApp` function.
- `NgDocGeneratedModule` was removed, now you need to use `provideNgDocContext` function to provide
  context of the generated documentation.

Please see updated `*GettingStartedInstallation#manual` articles for more information.

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
