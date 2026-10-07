---
keyword: DevServerAndBuildsPage
---

The new engine runs in the Vite host: Vite builds and serves the Angular application, and NgDoc
generates the documentation inside it. This page compares it with the legacy builders, and shows how
it runs in development and production.

<ng-doc-blockquote type="note" label="🧭 New or existing project?">

A new standalone application gets the Vite host from `ng add` (`*InstallationPage`). `ng update`
keeps existing projects on the legacy builders; for them, the new engine is opt-in: see
`*MigrateToNewEnginePage`. The legacy builders are described in `*LegacyBuildersPage`.

</ng-doc-blockquote>

## New engine or legacy builders

|               | Vite host (new engine)                                                         | Legacy builders                                             |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Status        | Recommended, full support                                                      | Deprecated in 22.0, no new features                         |
| Set up by     | `ng add`, `ng g @ng-doc/builder:migrate-to-vite`, or by hand (`*ViteHostPage`) | `ng update` keeps them; `ng add --engine legacy`            |
| Builders      | `@ng-doc/builder:vite-dev-server`, `@ng-doc/builder:vite-application`          | `@ng-doc/builder:dev-server`, `@ng-doc/builder:application` |
| Dev           | `vite`, or `ng serve` with `vite-dev-server`                                   | `ng serve`                                                  |
| Production    | `vite build`; server bundle and prerender with `ng build` (`vite-application`) | `ng build`                                                  |
| SSR           | Development renders in the browser; production prerenders every route          | Angular SSR                                                 |
| `onlyForTags` | Honoured (`*PagesAndCategoriesPage#build-tags`)                                | Ignored                                                     |
| Platforms     | Linux, macOS and Windows                                                       | Linux, macOS and Windows                                    |

Use the **Vite host** for new projects. To move a project off the legacy builders, run
`ng g @ng-doc/builder:migrate-to-vite` (`*MigrateToNewEnginePage`).

## How the new engine runs

```mermaid
flowchart LR
  files["Docs files"] --> engine["NgDoc engine"]
  engine --> generated["Generated folder"]
  generated --> vite["Vite host"]
  vite --> site["Site"]
```

The engine writes the generated folder first. Then Vite compiles the Angular application, which
imports the generated code from `@ng-doc/generated`. The Vite builders run the same Vite
configuration for `ng serve` and `ng build` (`*BuildersReference#vite-builders`).

In development, the engine keeps a compiler worker running between edits. When you save a file, it
rebuilds only the pages that depend on it, and the host updates the page in the browser.

## The `ng-doc` command

The `ng-doc` command runs the engine without Angular CLI or Vite. Use it in scripts, or to put
NgDoc in front of another development server:

```bash
ng-doc generate --project <project-name>
ng-doc dev --project <project-name> -- <dev-server-command>
```

`generate` builds the documentation once. `dev` builds it, watches your files, and starts the
command after `--` once the first build is ready. When `dev` stops, it stops the command and every
process the command started. On Windows, `ng`, `npm` and `npx` run through Node. Any other `.cmd`
or `.bat` command runs through `cmd.exe`, which can't pass an argument containing `"`, `%`, `!` or a
line break safely, so `dev` refuses one. `*BuildersReference#command-line-interface` lists every
flag.

## Keep another builder

Some applications are built by a builder that NgDoc must not replace, such as the one of
`@angular-architects/native-federation`, which runs Angular's `application` builder from another
target. Keep that builder, and generate the documentation with the `ng-doc` command instead:

1. Run `ng add @ng-doc/add` without `--engine`. It keeps a `build` or `serve` builder that is
   neither Angular's nor NgDoc's, and sets up everything else: the packages, the providers, the
   layout, the `@ng-doc/generated` path, and the styles, assets and budget of step 2. Or set NgDoc
   up by hand with steps 1 to 5 of `*InstallationPage#manual-setup`, without `vite` and
   `@analogjs/vite-plugin-angular`: the Vite engine of step 6 isn't needed.
2. The NgDoc styles and assets go to the target that builds the application; `ng add` adds them
   there. With native federation, it is the `esbuild` target, which its `build` target runs:

   <!-- prettier-ignore -->
   ```json name="angular.json"
   {
     "esbuild": {
       "builder": "@angular/build:application",
       "options": {
         "styles": [
           "node_modules/@ng-doc/app/styles/global.css",
           "node_modules/@ng-doc/app/styles/themes/dark.css",
           "src/styles.css"
         ],
         "assets": [
           { "glob": "**/*", "input": "public" },
           { "glob": "**/*", "input": "node_modules/@ng-doc/app/assets", "output": "assets/ng-doc/app" },
           { "glob": "**/*", "input": "node_modules/@ng-doc/ui-kit/assets", "output": "assets/ng-doc/ui-kit" },
           { "glob": "**/*", "input": "ng-doc/<project-name>/assets", "output": "assets/ng-doc" }
         ],
         "allowedCommonJsDependencies": ["@ng-doc/core"]
       }
     }
   }
   ```

   The last asset entry copies the generated assets, such as the API lists.

3. Start `ng serve` through `ng-doc dev`, and generate the documentation before `ng build`:

   ```json name="package.json"
   {
     "scripts": {
       "docs:serve": "ng-doc dev --project <project-name> --docs-root src --tsconfig tsconfig.app.json --output-root ng-doc/<project-name> -- ng serve",
       "docs:build": "ng-doc generate --project <project-name> --docs-root src --tsconfig tsconfig.app.json --output-root ng-doc/<project-name> && ng build"
     }
   }
   ```

   `--output-root` writes the generated folder where the `@ng-doc/generated` path and the assets
   entry point, `--docs-root` is the folder with your pages, and `--tsconfig` is the TypeScript
   configuration that includes the code your API pages document.

4. With native federation, don't share the NgDoc packages: add them to the list of skipped
   packages in the federation configuration. Otherwise every page is blank, and the browser
   console shows `Unable to resolve specifier '@ng-doc/core/...'`, because the import map lacks
   the deep imports of `@ng-doc/core`:

   ```js name="federation.config.mjs"
   export default withNativeFederation({
     // name, exposes, shared, ...
     skip: [
       // the packages that the configuration already skips
       (name) => name.startsWith('@ng-doc/'),
     ],
   });
   ```

## If something misbehaves

The new engine has environment switches that turn off one optimization each, such as the
long-running compiler worker. If a page doesn't update or a build fails only in development, try
the switches to find the cause. `*TroubleshootingPage` shows how, and `*BuildersReference` lists
them.

{% index false %}

## Related

- `*ViteHostPage`
- `*ProductionBuildsPage`
- `*PerformanceAndCachingPage`
- `*BuildersReference`

{% endindex %}

Next: `*ViteHostPage`
