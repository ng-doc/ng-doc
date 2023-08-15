# {{ NgDocPage.title }}

This page contains information about migrating from previous versions of NgDoc to the current
version.

## Migrating to >= v16.3

In v16.3.0, new standalone pages were introduced. Now you don't need `ng-doc.dependencies.ts` file
or `NgModule` anymore, all dependencies can be imported directly in the `ng-doc.page.ts` file.

To migrate from previous versions, you need to run the following command:

```bash
ng g @ng-doc/builder:standalone-pages-migration
```

This command will remove `ng-doc.dependencies.ts` file and update all `ng-doc.page.ts` files
by importing all dependencies directly.
