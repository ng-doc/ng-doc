---
keyword: 'GettingStartedConfiguration'
---

This section describes how you can configure certain functions of the library.

## Configuration file

The main library configuration can be done in `ng-doc.config.ts` configuration file, it should be
exported by default and match `NgDocConfiguration` interface.

> **Note** You can create a configuration file in the root of your repository or in the root of the
> documentation application.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  // ...
};

export default config;
```

## Configuration for target

You can also specify different configuration files for different build targets, for example, you can
specify different configurations for `build` and `serve` targets. To do that, you need to
specify `config` property in your app configuration file, after that NgDoc will use this
configuration
file instead of searching for `ng-doc.config.ts` file.

```json group="config" name="Angular (angular.json)" icon="angular"
{
  "projects": {
    "my-project": {
      "architect": {
        "serve": {
          "builder": "@ng-doc/builder:dev-server",
          "configurations": {
            "development": {
              "ngDoc": {
                "config": "src/ng-doc.config.for-dev.ts"
              }
            }
          }
        }
      }
    }
  }
}
```

```json group="config" name="Nx (project.json)" icon="nx"
{
  "targets": {
    "serve": {
      "executor": "@ng-doc/builder:dev-server",
      "configurations": {
        "development": {
          "ngDoc": {
            "config": "src/ng-doc.config.for-dev.ts"
          }
        }
      }
    }
  }
}
```

## Documentation folder

By default, NgDoc uses your project's `sourceRoot` folder defined in `angular.json` file
to search for documentation pages, but you can also change it by specifying `pages` property
in your `ng-doc.config.ts` file.

After that NgDoc will search for documentation pages in the specified folder and its subfolders.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  pages: 'libs/my-lib/src',
};

export default config;
```

## Output folder

You can also change the output folder for the documentation application by specifying `outDir`,
this folder is used for storing generated pages and other NgDoc files.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  outDir: 'src',
};

export default config;
```

After that NgDoc will generated and store everything inside `src/ng-doc/app-name` folder.
But remember that you should not commit this folder to your repository, and also update
the following things:

- Update the path to the `@ng-doc/generated` directory in `tsconfig.json` paths section.
- Update the path to the `ng-doc/app-name/assets` folder in `angular.json`np

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
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  repoConfig: {
    url: 'https://github.com/ng-doc/ng-doc',
    mainBranch: 'main',
    releaseBranch: 'release',
  },
};

export default config;
```

## Documentation route

By default, the documentation is located at the root of the application router and has routes
like `localhost:4200/getting-started`, but sometimes you may need to move it to a different route
to display other pages of the application as a landing page or something like that.

To do this, you need to create a component with routing that will be responsible
for displaying the documentation.

### Component

Same for the component, we just move the content that NgDoc adds by default to `AppComponent` to
`DocsComponent`.

```typescript name="docs.component.ts"
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';

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

const routes: Routes = [
  {
    path: '',
    component: DocsComponent,
    children: NG_DOC_ROUTING,
  },
];

export default routes;
```

### Global routing configuration

Now you need to add lazy loading for DocsComponent and set a route for it

```typescript name="main.ts"
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      [
        {
          path: 'docs',
          loadChildren: () => import('./docs/docs.component'),
        },
      ],
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
  ],
}).catch((err: unknown) => console.error(err));
```

### Configure NgDoc route prefix

NgDoc generates links automatically, and doesn't know what route the parent page will have, so you
need to specify the `routePrefix` property in `ng-doc.config.ts` file.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  routePrefix: 'docs',
};

export default config;
```

That's it, now you should be able to see your documentation on new route!
