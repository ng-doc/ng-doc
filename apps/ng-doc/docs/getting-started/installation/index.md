# {{ NgDocPage.title }}

NgDoc is just a library, so first you need to create an Angular application that will be used to
display documentation, it can be a separate application or an existing one.

When you install NgDoc, it will be integrated into the build process of your application, and will
generate
pages and components based on you code, that can be used in your application to display
documentation.

## Automatic (recommended)

To install the NgDoc, you can use the command below.
This command will automatically install and add the library to your project,
and configure it.

```bash group="install" name="Angular" icon="angular"
ng add @ng-doc/add
```

```bash group="install" name="Nx" icon="nx"
npm install @ng-doc/add && npx nx g @ng-doc/add:ng-add
```

By default, NgDoc uses your project's `sourceRoot` as the directory where you should create
documentation, you can always change this, see the `*GettingStartedConfiguration` article for more
details

## Manual

Install the NgDoc via npm

```bash
npm i @ng-doc/{core,builder,ui-kit,app}
```

### Adding builders

First of all you need to add builders from NgDoc library to your application,
replace `browser` and `dev-server` builders for `build` and `serve` targets with
alternatives from the NgDoc as shown in the example below

```json group="builders" name="Angular (angular.json)" icon="angular"
{
  "projects": {
    "my-project": {
      "architect": {
        "build": {
          "builder": "@ng-doc/builder:browser"
        },
        "serve": {
          "builder": "@ng-doc/builder:dev-server"
        }
      }
    }
  }
}
```

```json group="builders" name="Nx (project.json)" icon="nx"
{
  "targets": {
    "build": {
      "executor": "@ng-doc/builder:browser"
    },
    "serve": {
      "executor": "@ng-doc/builder:dev-server"
    }
  }
}
```

### Importing styles

You will also need to import the global styles provided by the library
by adding them to your `styles` array.

```json group="styles" name="Angular (angular.json)" icon="angular"
{
  "projects": {
    "my-project": {
      "architect": {
        "build": {
          "options": {
            "styles": ["node_modules/@ng-doc/app/styles/global.css"]
          }
        }
      }
    }
  }
}
```

```json group="styles" name="Nx (project.json)" icon="nx"
{
  "targets": {
    "build": {
      "options": {
        "styles": ["node_modules/@ng-doc/app/styles/global.css"]
      }
    }
  }
}
```

### Adding .ng-doc folder to gitignore

`.ng-doc` folder contains generated NgDoc files, you need to add it to your `.gitignore`,
because NgDoc regenerates them every time the application is launched.

```gitignore name=".gitignore"
## NgDoc folder
.ng-doc
```

### Adding assets

The NgDoc libraries come with assets that include various icons, fonts, themes, and other very
useful things. You also need to add them to your application's assets.

```json group="assets" name="Angular (angular.json)" icon="angular"
{
  "projects": {
    "my-project": {
      "targets": {
        "build": {
          "options": {
            "assets": [
              {
                "glob": "**/*",
                "input": "node_modules/@ng-doc/ui-kit/assets",
                "output": "assets/ng-doc/ui-kit"
              },
              {
                "glob": "**/*",
                "input": "node_modules/@ng-doc/app/assets",
                "output": "assets/ng-doc/app"
              },
              {
                "glob": "**/*",
                "input": ".ng-doc/<project-name>/assets",
                "output": "assets/ng-doc"
              }
            ]
          }
        }
      }
    }
  }
}
```

```json group="assets" name="Nx (project.json)" icon="nx"
{
  "targets": {
    "build": {
      "options": {
        "assets": [
          {
            "glob": "**/*",
            "input": "node_modules/@ng-doc/ui-kit/assets",
            "output": "assets/ng-doc/ui-kit"
          },
          {
            "glob": "**/*",
            "input": "node_modules/@ng-doc/app/assets",
            "output": "assets/ng-doc/app"
          },
          {
            "glob": "**/*",
            "input": ".ng-doc/<project-name>/assets",
            "output": "assets/ng-doc"
          }
        ]
      }
    }
  }
}
```

### Updating tsconfig

NgDoc generates components for your documentation that you later need to import into the
application, NgDoc also uses synthetic imports that you need to enable,
to do this, edit the tsconfig.json of the existing application by adding the path to
the generated files and `allowSyntheticDefaultImports` option.

```json name="tsconfig.json"
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "paths": {
      "@ng-doc/generated": [".ng-doc/<project-name>/index.ts"],
      "@ng-doc/generated/*": [".ng-doc/<project-name>/*"]
    }
  }
}
```

### Importing global modules

Import the global library-provided modules into your application's root `AppModule`,
and add `NgDocDefaultSearchEngine` to the providers section to enable search.

```typescript name="Stnadalone APP (main.ts)" group="imports"
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import {
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NgDocDefaultSearchEngine,
  provideNgDocApp,
} from '@ng-doc/app';
import { NG_DOC_ROUTING, provideNgDocContext } from '@ng-doc/generated';

import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    // Provide context of the generated documentation
    provideNgDocContext(),
    // Provide default configuration for the documentation app
    provideNgDocApp({
      searchEngine: {
        engine: NgDocDefaultSearchEngine,
      },
      pageProcessors: NG_DOC_DEFAULT_PAGE_PROCESSORS,
    }),
    // Provide animations
    provideAnimations(),
    // Provide HttpClient with interceptors (NgDoc uses interceptors)
    provideHttpClient(withInterceptorsFromDi()),
    // Add generated routes to the application
    provideRouter(
      NG_DOC_ROUTING,
      // Enable anchor scrolling
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
  ],
}).catch((err: unknown) => console.error(err));
```

```typescript name="Module APP (app.module.ts)" group="imports"
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import {
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NgDocDefaultSearchEngine,
  NgDocNavbarComponent,
  NgDocRootComponent,
  NgDocSidebarComponent,
  provideNgDocApp,
} from '@ng-doc/app';
import { NG_DOC_ROUTING, provideNgDocContext } from '@ng-doc/generated';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    // To enable animations ( import NoopAnimationsModule if you don't like animations :( )
    BrowserAnimationsModule,
    // Add generated routes to the application
    RouterModule.forRoot(NG_DOC_ROUTING, {
      // Enable anchor scrolling
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
      scrollOffset: [0, 70],
    }),
    // Import NgDocRootComponent to display the documentation
    NgDocRootComponent,
    // Import NavBar, Sidebar components
    NgDocNavbarComponent,
    NgDocSidebarComponent,
  ],
  providers: [
    // Provide default configuration for the documentation app
    provideNgDocApp({
      searchEngine: {
        engine: NgDocDefaultSearchEngine,
      },
      pageProcessors: NG_DOC_DEFAULT_PAGE_PROCESSORS,
    }),
    // Provide context of the generated documentation
    provideNgDocContext(),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

### Adding application layout

You will also need to add an application layer to your root `AppComponent` to display header and
menu, to do this open your `app.component.html` file and add the following code to it

```html name="app.component.html"
<ng-doc-root>
  <ng-doc-navbar [leftContent]="leftContent">
    <ng-template #leftContent>
      <h3 class="brand" style="margin: 0">MyDocs</h3>
    </ng-template>
  </ng-doc-navbar>
  <ng-doc-sidebar></ng-doc-sidebar>
  <router-outlet></router-outlet>
</ng-doc-root>
```
