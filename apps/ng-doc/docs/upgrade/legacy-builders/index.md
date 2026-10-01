---
keyword: LegacyBuildersPage
---

The legacy builders, `@ng-doc/builder:application` and `@ng-doc/builder:dev-server`, keep existing
projects working in 22.0: `ng update` leaves a project on them. `ng add` sets them up for an
NgModule application, an application on another builder than Angular's `application` builder, or
with `--engine legacy` ([when `ng add` sets them up](#when-ng-add-sets-them-up)); a new standalone
application gets the Vite engine (`*InstallationPage`). This page covers everything that is
specific to them. The other pages describe behaviour that is the same in both engines.

> **Warning**
> The legacy builders are deprecated in 22.0. They still ship and work, and `ng update` doesn't
> move you off them, but they receive no new features and will be removed in a future major
> release. Plan the move to the new engine with the `migrate-to-vite` schematic
> (`*MigrateToNewEnginePage`).

## When `ng add` sets them up

`ng add @ng-doc/add` chooses the engine for the application:

- A **new standalone application** on Angular's `application` builder gets the Vite engine
  (`*InstallationPage`).
- An **NgModule application** (one that calls `bootstrapModule`) gets the legacy builders. Passing
  `--engine vite` to it stops with an error (`NGDOC_ADD_ENGINE`). To move it to the Vite engine
  later, run `ng g @ng-doc/builder:migrate-to-vite` (`*MigrateToNewEnginePage`).
- An application whose `build` target uses **another builder**, such as `@nx/angular:application`
  or the `browser` builder, gets the legacy builders, because the Vite engine reads the options of
  Angular's `application` builder. With `--engine vite`, the command stops instead.
- A **project that already uses NgDoc** (any target runs an `@ng-doc/builder` builder) keeps its
  builders. `ng add` never switches the engine of a project: move a project from the legacy
  builders with `ng g @ng-doc/builder:migrate-to-vite`.

To use the legacy builders in a new application, pass `--engine legacy`:

```bash
ng add @ng-doc/add --engine legacy
```

| Option                  | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `--engine=vite\|legacy` | The engine to set up. Without it, the command chooses as described above. |

With the legacy builders, the command doesn't add Vite, `vite.config.mjs` or `build-angular`, and
doesn't change `main.server.ts`. Instead, the `build` target uses `@ng-doc/builder:application` and
the `serve` target uses `@ng-doc/builder:dev-server`; the NgDoc styles, three asset folders and
`@ng-doc/core` in `allowedCommonJsDependencies` go to the `build` target; in a project new to
NgDoc, an `initial` budget error of 1 MB, the `ng new` default, is raised to `5mb`, because the
NgDoc runtime alone is larger; and in an NgModule application, the providers and the layout
components go to the root module. The other changes are the same as with the Vite engine
(`*InstallationPage#what-the-command-changed`).

## Set up the builders

`ng add @ng-doc/add --engine legacy` does these steps for you. To do them by hand, first follow
the manual setup in `*InstallationPage#manual-setup`: install the NgDoc packages from step 1
(without `vite` and `@analogjs/vite-plugin-angular`), then do steps 2 to 5. Then:

### 1. Replace the builders

Use the NgDoc builders for the `build` and `serve` targets. They wrap the Angular `@angular/build`
builders and accept the same options.

```json group="builders" name="Angular CLI (angular.json)" icon="angular"
{
  "projects": {
    "<project-name>": {
      "architect": {
        "build": {
          "builder": "@ng-doc/builder:application"
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
      "executor": "@ng-doc/builder:application"
    },
    "serve": {
      "executor": "@ng-doc/builder:dev-server"
    }
  }
}
```

### 2. Add the assets

Add the NgDoc assets and the generated assets to the `build` target:

```json group="assets" name="Angular CLI (angular.json)" icon="angular"
{
  "projects": {
    "<project-name>": {
      "architect": {
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
                "input": "ng-doc/<project-name>/assets",
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
            "input": "ng-doc/<project-name>/assets",
            "output": "assets/ng-doc"
          }
        ]
      }
    }
  }
}
```

If you change `outDir` in the configuration file, change the input of the last entry to match.

### 3. Add the styles

Add the NgDoc styles to the `styles` array of the `build` target (the global styles and the dark
theme, which the theme toggle switches to), and allow `@ng-doc/core`, which is a CommonJS package.

```json group="styles" name="Angular CLI (angular.json)" icon="angular"
{
  "projects": {
    "<project-name>": {
      "architect": {
        "build": {
          "options": {
            "styles": [
              "node_modules/@ng-doc/app/styles/global.css",
              "node_modules/@ng-doc/app/styles/themes/dark.css",
              "src/styles.css"
            ],
            "allowedCommonJsDependencies": ["@ng-doc/core"]
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
        "styles": [
          "node_modules/@ng-doc/app/styles/global.css",
          "node_modules/@ng-doc/app/styles/themes/dark.css",
          "src/styles.css"
        ],
        "allowedCommonJsDependencies": ["@ng-doc/core"]
      }
    }
  }
}
```

## Options

The builders accept every option of the Angular builders they wrap, plus:

| Option         | Type     | Description                                                            |
| -------------- | -------- | ---------------------------------------------------------------------- |
| `ngDoc.config` | `string` | The configuration file for this target, instead of the discovered one. |

Use it to give a target its own configuration, for example for development:

```json group="config" name="Angular CLI (angular.json)" icon="angular"
{
  "projects": {
    "<project-name>": {
      "architect": {
        "serve": {
          "builder": "@ng-doc/builder:dev-server",
          "configurations": {
            "development": {
              "ngDoc": {
                "config": "src/ng-doc.config.dev.ts"
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
            "config": "src/ng-doc.config.dev.ts"
          }
        }
      }
    }
  }
}
```

## Defaults

| Setting              | Legacy builders                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Documentation folder | The folder of the `browser` entry file, usually `src`                                                 |
| Configuration file   | `ng-doc.config.ts` or `ng-doc.config.js`, searched from the folder of the `browser` entry file upward |
| Generated folder     | `ng-doc/<project-name>`                                                                               |
| Cache                | Off. Set `cache: true` to turn it on.                                                                 |
| Cache folder         | `node_modules/.cache/ng-doc`                                                                          |
| `onlyForTags`        | Ignored: every page and category is built                                                             |

To clear the cache, delete `node_modules/.cache/ng-doc`. When the cache is off, the builders delete
the generated folder before each build.

## Add server-side rendering

`ng add @angular/ssr` reads the builder of the `build` target and fails on NgDoc builders with this
error:

```text
Path "undefined" does not exist.
```

Switch to the Angular builders, run `ng add @angular/ssr`, then switch back:

| NgDoc builder                 | Angular builder              |
| ----------------------------- | ---------------------------- |
| `@ng-doc/builder:application` | `@angular/build:application` |
| `@ng-doc/builder:dev-server`  | `@angular/build:dev-server`  |

Then wrap the server bootstrap function with `withNgDocContentReady`
(`*ProductionBuildsPage#wait-for-content-on-the-server`).

{% index false %}

## Related

- `*MigrateToNewEnginePage`
- `*InstallationPage`
- `*ConfigurationReference`

{% endindex %}

Next: `*OlderVersionsPage`
