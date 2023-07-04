# {{ NgDocPage.title }}

This section describes how you can configure certain functions of the library.

## Configuration file

The main library configuration can be done in `ng-doc.config.ts` configuration file, it should be
exported by default and match `NgDocConfiguration` interface.

> **Note** You can create a configuration file in the root of your repository or in the root of the
> documentation application.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  // ...
});
```

## Documentation folder

By default, NgDoc uses your project's `sourceRoot` folder defined in `angular.json` file
to search for documentation pages, but you can also change it by specifying `pages` property
in your `ng-doc.config.ts` file.

After that NgDoc will search for documentation pages in the specified folder and its subfolders.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  pages: 'libs/my-lib/src',
});
```

## Output folder

You can also change the output folder for the documentation application by specifying `outDir`,
this folder is used for storing generated pages and modules.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  outDir: 'src',
});
```

After that NgDoc will generated and store everything inside `src/.ng-doc/app-name` folder.
But remember that you should not commit this folder to your repository, and also update
the following things:

- Update the path to the `@ng-doc/generated` directory in `tsconfig.json` paths section.
- Update the path to the `.ng-doc/app-name/assets` folder in `angular.json`

## ESBuild builder

> **Warning**
> This feature is experimental and may not work as expected.
> For more information, see [this guide](https://angular.io/guide/esbuild)
> Also, see following
> issues: [Markdown content not updating](https://github.com/ng-doc/ng-doc/issues/65)

By default, NgDoc uses `webpack` to build and serve the documentation application, but you can also
use
`esbuild`, to switch to `esbuild` you need to specify `angularBuilder` property in your
`ng-doc.config.ts` file, it will enable `esbuild` builder for `build` target and `vite` + `esbuild`
for `serve` target.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  angularBuilder: 'esbuild',
});
```

## External packages in guides

Sometimes you may need to use external packages in your `ng-doc.page.ts`, for example, to load some
file and
display it in the guide via `data` field. If you try to use `fs` or `path` packages, you will get an
error,
because these packages are not available by default.

To solve this problem, you need to specify `externalPackages` property in your `ng-doc.config.ts`
file,
it will be passed to `esbuild` as `external` option.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  guide: {
    externalPackages: ['fs', 'path'],
  },
});
```

## Configuring repository

If you are creating an open source project and would like to receive suggestions for improving the
documentation from your users, then the best way is to make this process easier for them, you can do
this by adding a "Suggest edits" and "View Source" buttons to each page, for this
specify `repoConfig` that should match `NgDocRepoConfig` interface in your `ng-doc.config.ts` file.

After that, NgDoc will start displaying links for editing and viewing the source code of the page.

> **Note**
> NgDoc supports only GitHub repositories, you can ask for support for other repositories by
> creating an issue in our `ngDocFeatureRequest` page.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  repoConfig: {
    url: 'https://github.com/ng-doc/ng-doc',
    mainBranch: 'main',
    releaseBranch: 'release',
  },
});
```

## Documentation route

By default, the documentation is located at the root of the application router and has routes
like `localhost:4200/getting-started`, but sometimes you may need to move it to a different route
to display other pages of the application as a landing page or something like that.

To do this, you need to create a separate component and module with routing that will be responsible
for displaying the documentation, for example:

### Module

As far as you can see, we just moved the import of NgDoc modules from `AppModule` to a
new `DocsModule`
and made it a child, in the future we will also do lazy loading so as not to load dependencies that
other pages do not need.

```typescript name="docs.module.ts"
import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {NG_DOC_ROUTING, NgDocGeneratedModule} from '@ng-doc/generated';
import {DocsComponent} from './docs.component';
import {NgDocNavbarModule} from '@ng-doc/app/components/navbar';
import {NgDocRootModule} from '@ng-doc/app/components/root';
import {NgDocSidebarModule} from '@ng-doc/app/components/sidebar';

@NgModule({
  imports: [
    CommonModule,
    NgDocNavbarModule,
    NgDocSidebarModule,
    NgDocModule.forRoot(),
    NgDocGeneratedModule.forRoot(),
    RouterModule.forChild([
      {
        path: '',
        children: NG_DOC_ROUTING,
      },
    ]),
  ],
  declarations: [DocsComponent],
  exports: [RouterModule],
})
export class DocsModule {}
```

### Component

Same for the component, we just move the content that NgDoc adds by default to `AppComponent` to
`DocsComponent`.

```typescript name="docs.component.ts"
import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
  selector: 'ng-doc-docs',
  template: `
    <ng-doc-root>
      <ng-doc-navbar [leftContent]="leftContent">
        <ng-template #leftContent>
          <h3 style="margin: 0">MyAwesomeDoc</h3>
        </ng-template>
      </ng-doc-navbar>
      <ng-doc-sidebar></ng-doc-sidebar>
      <router-outlet></router-outlet>
    </ng-doc-root>
  `,
  styleUrls: ['./docs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {}
```

### Routing in AppModule

Now you need to add lazy loading for DocsModule and set a route for it

```typescript name="app.module.ts"
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {RouterModule} from '@angular/router';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    RouterModule.forRoot([
      {
        path: 'docs',
        loadChildren: () => import('./docs/docs.module').then((m: typeof import('./docs/docs.module')) => m.DocsModule),
      },
    ]),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

### Configure NgDoc route prefix

NgDoc generates links automatically, and doesn't know what route the parent page will have, so you
need to specify the `routePrefix` property in `ng-doc.config.ts` file.

```typescript name="ng-doc.config.ts"
import {config} from '@ng-doc/builder';

export default config({
  routePrefix: 'docs',
});
```

That's it, now you should be able to see your documentation on new route!
