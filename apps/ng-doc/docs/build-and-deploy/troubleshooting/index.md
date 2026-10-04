---
keyword: TroubleshootingPage
---

Common problems, their causes and fixes. Entries with a diagnostic code are titled by the code, so
you can search for the code in the error message. `*DiagnosticCodesReference` lists the codes.

## Setup

### Cannot find module `@ng-doc/generated`

**Cause:** your editor or TypeScript checks the code before NgDoc has generated anything. The
`@ng-doc/generated` path points to the generated folder, which doesn't exist until the first build.

**Fix:** start the development server or run a build once. If the error stays, check that the
`@ng-doc/generated` path in `tsconfig.json` points to `ng-doc/<project-name>/index.ts`.

**See also:** `*InstallationPage#3-map-ng-docgenerated`

### NG0201: No provider found

**Cause:** the application doesn't provide the generated context, or it loads two copies of the
NgDoc packages. Two copies appear when `tsconfig.json` maps `@ng-doc/*` packages to other folders,
so the providers and the components use different injection tokens.

**Fix:** add `provideNgDocContext()` from `@ng-doc/generated` to the providers. In
`tsconfig.json`, keep only the `@ng-doc/generated` mapping for NgDoc paths.

**See also:** `*AppProvidersReference`

### Type errors in `node_modules`

**Cause:** `tsconfig.json` sets `"skipLibCheck": false`, so TypeScript checks the type
declarations of every package the application uses. The types of NgDoc refer to other packages,
such as Shiki and Mermaid, and some of their declarations don't compile with every TypeScript
version, `lib` and `strict` setting. The errors name a declaration file, for example
`node_modules/mermaid/dist/types.d.ts`, not your code.

**Fix:** set `"skipLibCheck": true` in `compilerOptions`, as projects created by the Angular CLI
do. TypeScript then doesn't check declaration files (`.d.ts`), such as those of packages, and
still checks your own code.

```json name="tsconfig.json"
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

### DISCOVERY_CONFIG_MISSING

**Cause:** the Vite plugin's `generator.configFile` or the `--config` flag of the `ng-doc` command
points to a configuration file that doesn't exist.

**Fix:** correct the path: `generator.configFile` is absolute, and `--config` is relative to the
workspace root. Or remove the option, so NgDoc finds `ng-doc.config.ts` itself.

**See also:** `*ConfigurationReference#where-ngdoc-finds-the-file`

## Content

### Unknown page keyword

The build fails with `CONTENT_LINK`, or with the message `Route with keyword "…" is missing.`

**Cause:** inline code starts with `*` but no page has that keyword, or the anchor after `#` doesn't
match a heading. An unknown anchor on an API keyword fails the same way.

**Fix:** check the `keyword` in the front matter of the target page, and the heading of the
section. Keywords are case-sensitive.

**See also:** `*LinksAndKeywordsPage`

### CONTENT_KEYWORD_FILTERED

**Cause:** a page links to the keyword of a page or category that `onlyForTags` leaves out of this
build. For example, a guide links to a sandbox page that only development builds keep.

**Fix:** remove the link, or link from a page with the same `onlyForTags`. The message names the
left-out page, its tags and the tags of the build.

**See also:** `*PagesAndCategoriesPage#build-tags`

### DISCOVERY_EVALUATION_FAILED

**Cause:** a page, category, API or configuration file threw an error when NgDoc ran it, or a
Markdown template failed to render. Common template causes are a Nunjucks syntax error, and an
`include` or `import` of a file that doesn't exist. The message has the details.

**Fix:** check the paths in `include` and `import`: they are relative to the Markdown file. Then fix
the file that the message names.

**See also:** `*TemplatesPage`

### SEMANTIC_FAILED

**Cause:** the analysis of your TypeScript sources failed with an unexpected error.

**Fix:** read the message, which names the error. If it points to NgDoc rather than to your code,
report it with the full message.

### SEMANTIC_OWNED_ROOT_OVERLAP

**Cause:** the documentation folder, the TypeScript configuration or an API scope includes the
generated folder or the cache folder. NgDoc would read its own output.

**Fix:** narrow the `include` patterns of the API scope, or add the generated folder to its
`exclude`:

```typescript name="ng-doc.api.ts"
exclude: ['ng-doc/**'],
```

Keep the generated and cache folders outside the documentation folder.

**See also:** `*GenerateApiPagesPage`

## Switching engines

### OUTPUT_UNOWNED_COLLISION

**Cause:** the output folder, whose path the message names (usually `ng-doc/<project-name>`), has
files that the new engine didn't write. The new engine never overwrites them. A common cause is
the legacy builders, such as the `build-legacy` and `serve-legacy` targets kept by
`migrate-to-vite`, or another tool writing to the same folder.

**Fix:** delete that folder and restart; the new engine writes it again. If the other writer keeps
running, give it its own folder. For the legacy builders, set `outDir: 'ng-doc-legacy'` in the
NgDoc configuration they load and map their `@ng-doc/generated` path and generated assets entry to
`ng-doc-legacy/ng-doc/<project-name>`, as `migrate-to-vite` does.

**See also:** `*MigrateToNewEnginePage`

## Vite host

### NGDOC_VITE_VERSION

**Cause:** the Vite engine started with a Vite outside `^8.3.0`, such as Vite 7. It runs on Vite 8
from 8.3.0. The error names the version it found. It usually comes from a `vite` entry in
`package.json` that an older setup pinned, or from Angular 22.0 or 22.1, whose build tools bring
Vite 7.3 or 8.1 when the application doesn't list `vite` itself.

**Fix:** install Vite 8 in the application's `devDependencies`, then restart:

```bash
npm i -D vite@^8.3.0
```

The legacy builders (`@ng-doc/builder:application` and `dev-server`) don't use Vite.

**See also:** `*BuildersReference#supported-versions`

### NGDOC_VITE_ANGULAR_VERSION

**Cause:** the `@angular/compiler-cli` and the `@angular/build` that NgDoc finds come from
different Angular releases, one before 22.2 and one 22.2 or later, or one of them is missing. The
Angular plugin the engine bundles chooses how it calls `@angular/build` from the compiler's version,
so a mismatched pair fails later with an unclear error, such as "Hash utility must be initialized";
the engine stops first. The error names both versions.

This usually means the package manager installed a second `@angular/build` for NgDoc next to the
project's own, for example after an override or a lockfile that pins one.

**Fix:** find the copies, give every `@angular/*` package the same Angular version, reinstall, then
restart:

```bash
npm ls @angular/build
ng update @angular/core@22 @angular/cli@22
```

If a second copy remains, deduplicate it (`npm dedupe`, or an `overrides` entry, a pnpm override or
a Yarn `resolutions` entry with the project's version). Any Angular 22 release works, as long as
both packages come from the same side of 22.2.

**See also:** `*BuildersReference#supported-versions`

### NGDOC_VITE_WATCH_CAPACITY

**Cause:** the plugin needs to watch more files and folders outside the Vite root than
`maxExternalWatchTargets` allows. The default is 50 000.

**Fix:** narrow the documentation folder and the API scopes, or raise `maxExternalWatchTargets`, up
to 100 000.

**See also:** `*BuildersReference#vite-plugin`

### NGDOC_VITE_RESTART_REQUIRED

**Cause:** a setting that the running server can't apply changed, such as the generated folder or the
cache folder.

**Fix:** restart the Vite server.

### NGDOC_VITE_OUTPUT_LEASE

**Cause:** two NgDoc plugin instances in the same Vite process use the same project or the same
generated folder. This happens when the plugin is registered twice, or when a script creates a new
Vite server without closing the previous one.

**Fix:** register `createNgDocVitePlugin` once per project, and close a Vite server before you
create another one in the same process.

## Production builds

### Prerender can't load `api-list.json`

With the legacy builders, `ng build` fails to prerender an API page with
`Http failure response for http://ng-localhost/assets/ng-doc/<api-route>/api-list.json: 0`, or,
with `outputMode: 'server'`, with
`Unable to handle request: '/assets/ng-doc/<api-route>/api-list.json'`.

**Cause:** the build doesn't copy the generated assets. NgDoc writes the API lists to
`ng-doc/<project-name>/assets`, and the legacy builders copy that folder only through an entry in
the `assets` of the `build` target. The entry is missing, or its input points to another folder,
for example after a change of `outDir` or a move of the project.

**Fix:** add the entry that `ng add` writes to the `assets` of the `build` target:

```json name="angular.json"
{
  "glob": "**/*",
  "input": "ng-doc/<project-name>/assets",
  "output": "assets/ng-doc"
}
```

If you set `outDir` in the configuration file, change its input to match. The Vite builders copy
the generated assets themselves, so they need no entry.

**See also:** `*LegacyBuildersPage#2-add-the-assets`

## Development server

### Worker crashes and timeouts

The build fails with `WORKER_CRASH`, `WORKER_EXIT` or `WORKER_COMPILE_TIMEOUT`, or a page stops
updating.

**Cause:** the compiler worker stopped or took longer than the time limit.

**Fix:** restart the server. If it happens again, turn off the optimizations one by one to find the
cause, and include the result in your bug report:

```bash
NGDOC_PERSISTENT_WORKER_PRIME=0 ng serve
NGDOC_DELTA_TRANSPORT=0 ng serve
NGDOC_INCREMENTAL_SKIP=0 ng serve
NGDOC_INCREMENTAL_PROGRAM=0 ng serve
NGDOC_SHAPE_CLOSURE=0 ng serve
NGDOC_ANGULAR_SHARED_PASS=0 ng serve
NGDOC_SCOPED_SEMANTIC=0 ng serve
NGDOC_TARGETED_REBUILD=0 ng serve
NGDOC_PERSISTENT_WORKER=0 ng serve
```

With the Vite host, `ng serve` works when it runs the `vite-dev-server` builder; otherwise use your
Vite command, such as `npx vite`. `NGDOC_ANGULAR_SHARED_PASS` affects only the Vite host.

**See also:** `*BuildersReference#environment-switches`

### WATCHER_RESCAN

**Cause:** the operating system dropped file events, which can happen on macOS when many files
change at once, for example during a branch switch. NgDoc checks the watched files again.

**Fix:** no action is needed. If a page doesn't update afterwards, save the file again or restart
the server.

{% index false %}

## Related

- `*DiagnosticCodesReference`
- `*PerformanceAndCachingPage`
- `ngDocBugReport`

{% endindex %}

Next: `*UpgradeTo22Page`
