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

**Cause:** the generated folder has files that the new engine didn't write. This usually happens
after switching from the legacy builders, which leave their output in the same folder.

**Fix:** delete the generated folder, `ng-doc/<project-name>`, once. The new engine writes it again
on the next build.

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
