---
keyword: DiagnosticCodesReference
---

The new engine reports every problem with a diagnostic code. Codes are stable: search for a code
here or in `*TroubleshootingPage`, and use it in bug reports. The legacy builders don't use codes.

## Format

| Entry point          | Format                       | Example                                                                    |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Angular CLI builders | `[CODE] message`             | `[DISCOVERY_CONFIG_MISSING] Configuration file does not exist: …`          |
| Vite plugin          | `[CODE] message (file:line)` | `[CONTENT_LINK] … (docs/guide/index.md:12)`                                |
| `ng-doc` command     | `[severity] CODE: message`   | `[error] OUTPUT_UNOWNED_COLLISION: Refusing to overwrite unowned output …` |
| `ng-doc --json`      | One JSON object per line     | See `*DiagnosticCodesReference#json-output`                                |

The severity is `error`, `warning` or `info`. Errors stop the build. Warnings and info don't.

### JSON output

With `--json`, the `ng-doc` command prints one JSON object per line:

```json name="ng-doc --json"
{"kind":"diagnostic","diagnostic":{"code":"WATCHER_RESCAN","severity":"warning","message":"…","stage":"host"}}
{"kind":"result","result":{"status":"success","diagnostics":[],"…":"…"}}
```

- A `diagnostic` line reports one diagnostic while `dev` or `watch` runs. It has `code`,
  `severity`, `message` and `stage`, and can have `source`.
- A `result` line reports the result of a build. Its `diagnostics` array lists the diagnostics of
  that build.

## Prefixes

| Prefix                                          | Stage                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DISCOVERY_`                                    | Loading the configuration file and the page, category and API files.                           |
| `SEMANTIC_`                                     | Analysing TypeScript: API scopes, demos and playgrounds.                                       |
| `CONTENT_`                                      | Rendering Markdown and templates.                                                              |
| `COMPILATION_`                                  | Planning the build and reusing cached results.                                                 |
| `GRAPH_`                                        | Tracking which files each result depends on.                                                   |
| `OUTPUT_`                                       | Writing the generated folder.                                                                  |
| `ARTIFACT_CACHE_`                               | Reading the cache. These warnings mean an entry was unreadable or inconsistent and is rebuilt. |
| `SESSION_`, `WATCHER_`, `WORKER_`, `BOOTSTRAP_` | Running the build session, the file watcher and the compiler worker.                           |
| `NGDOC_VITE_`                                   | The Vite plugin.                                                                               |
| `NGDOC_SSR_`                                    | Server-side rendering in the Vite development server.                                          |
| `NGDOC_ANGULAR_`                                | The Angular CLI builders.                                                                      |

## Codes you can fix

These codes point to a problem in your files or setup. The linked entries explain the fix.

### Discovery

| Code                                   | Severity | Meaning                                                                                                                                                                                                                             |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOVERY_CONFIG_MISSING`             | error    | The configuration file set by a builder option or flag doesn't exist (`*TroubleshootingPage#discovery_config_missing`).                                                                                                             |
| `DISCOVERY_MODULE_BUILD_FAILED`        | error    | A page, category, API or configuration file doesn't compile.                                                                                                                                                                        |
| `DISCOVERY_UNSUPPORTED_DEFAULT_EXPORT` | error    | An entity file must default-export a named variable with an object literal.                                                                                                                                                         |
| `DISCOVERY_INVALID_ENTRY`              | error    | A page, category or API file has no `title`, or its `onlyForTags` isn't a string or an array of strings.                                                                                                                            |
| `DISCOVERY_TAGS_INVALID`               | error    | The Vite plugin's or the API's `generator.discovery.tags` aren't an array of non-empty strings (`*PagesAndCategoriesPage#build-tags`). The `ng-doc` command and the Angular CLI builders check their tags before the build instead. |
| `DISCOVERY_CATEGORY_SOURCE_MISSING`    | error    | A page imports a category from outside the documentation folder.                                                                                                                                                                    |
| `DISCOVERY_CATEGORY_CYCLE`             | error    | Categories are nested in a loop.                                                                                                                                                                                                    |
| `DISCOVERY_KEYWORD_LOADER_FAILED`      | error    | A keyword loader failed.                                                                                                                                                                                                            |
| `DISCOVERY_KEYWORD_INVALID`            | warning  | An entry of `keywords.keywords` has no `url`. It is left out.                                                                                                                                                                       |
| `DISCOVERY_EVALUATION_FAILED`          | error    | Running an entity or configuration file failed, or a Markdown template failed to render, for example a Nunjucks syntax error or a missing `include` (`*TroubleshootingPage#discovery_evaluation_failed`).                           |
| `DISCOVERY_SOURCE_OUTSIDE_WORKSPACE`   | error    | A page, category or API file resolves outside the workspace, for example through a symbolic link.                                                                                                                                   |

### Semantic analysis

| Code                           | Severity | Meaning                                                                                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SEMANTIC_OWNED_ROOT_OVERLAP`  | error    | Documentation or API sources overlap the generated or cache folder (`*TroubleshootingPage#semantic_owned_root_overlap`). |
| `SEMANTIC_FAILED`              | error    | Analysis failed with an unexpected error (`*TroubleshootingPage#semantic_failed`).                                       |
| `SEMANTIC_CONFIG`              | error    | The TypeScript configuration can't be read.                                                                              |
| `SEMANTIC_DEMO_TARGET`         | error    | A demo component can't be resolved.                                                                                      |
| `SEMANTIC_PLAYGROUND_TARGET`   | error    | The target of a playground can't be resolved.                                                                            |
| `SEMANTIC_DEMO_OBJECT`         | error    | A page's `demos` isn't an object literal that maps names to component classes.                                           |
| `SEMANTIC_PLAYGROUNDS_OBJECT`  | error    | A page's `playgrounds` isn't an object literal.                                                                          |
| `SEMANTIC_PLAYGROUND_OBJECT`   | error    | A playground isn't a named property, or its configuration can't be resolved.                                             |
| `SEMANTIC_CONTROLS_SHAPE`      | error    | An entry in a playground's `controls` is neither a type name nor an object with a `type`.                                |
| `SEMANTIC_DECLARATION_PATH`    | error    | An `NgDocApi` or `JSDoc` path isn't in the form `path/to/file.ts#ExportName`.                                            |
| `SEMANTIC_DECLARATION_MISSING` | error    | The declaration in such a path doesn't exist.                                                                            |
| `SEMANTIC_ROUTE_COLLISION`     | error    | Two API declarations need the same route.                                                                                |
| `SEMANTIC_ROUTE_DISAMBIGUATED` | warning  | Two API declarations had the same route, and one got a new route.                                                        |
| `SEMANTIC_DECLARATION_KIND`    | info     | An exported declaration of an unsupported kind was skipped.                                                              |

### Content

| Code                        | Severity | Meaning                                                                                                                                           |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTENT_LINK`              | error    | A page keyword, or an anchor on a keyword, doesn't exist (`*TroubleshootingPage#unknown-page-keyword`).                                           |
| `CONTENT_KEYWORD_FILTERED`  | error    | A link points to the keyword of a page or category that `onlyForTags` leaves out of this build (`*TroubleshootingPage#content_keyword_filtered`). |
| `CONTENT_COMPILE`           | error    | A Markdown file can't be rendered, for example because of invalid code block attributes.                                                          |
| `CONTENT_READ`              | error    | A Markdown file can't be read.                                                                                                                    |
| `CONTENT_FRONTMATTER`       | error    | The front matter of a Markdown file is invalid.                                                                                                   |
| `CONTENT_HEADER_READ`       | error    | The `guide.headerTemplate` file can't be read.                                                                                                    |
| `CONTENT_SNIPPET_READ`      | error    | The file in a code block's `file` attribute doesn't exist.                                                                                        |
| `CONTENT_DEMO`              | error    | `NgDocActions.demo` or `demoPane` names a demo that the page doesn't register.                                                                    |
| `CONTENT_PLAYGROUND`        | error    | `NgDocActions.playground` names a playground that the page doesn't register.                                                                      |
| `CONTENT_PLAYGROUND_SOURCE` | error    | The source file of a playground's target doesn't exist.                                                                                           |
| `CONTENT_ACTION`            | error    | A template calls an action that doesn't exist.                                                                                                    |
| `KEYWORD_DUPLICATE`         | warning  | Two sources define the same keyword. The last one wins. Define the keyword in `keywords.keywords` to choose its target without this warning.      |
| `KEYWORD_PIN_UNRESOLVED`    | warning  | A `keywords.keywords` route replaces a loader's link, but no page or API declaration of the build has that route.                                 |

### Output

| Code                          | Severity | Meaning                                                                                                    |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `OUTPUT_UNOWNED_COLLISION`    | error    | The generated folder has a file that NgDoc didn't write (`*TroubleshootingPage#output_unowned_collision`). |
| `OUTPUT_ROUTE_PATH_COLLISION` | error    | Two pages resolve to the same URL.                                                                         |
| `OUTPUT_GUIDE_ROOT`           | error    | A page is outside the documentation folder.                                                                |

### Vite plugin

| Code                               | Meaning                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGDOC_VITE_VERSION`               | The Vite engine runs on another Vite than 7.3.5 (`*TroubleshootingPage#ngdoc_vite_version`).                                                         |
| `NGDOC_VITE_WATCH_CAPACITY`        | The plugin needs more watch targets than allowed (`*TroubleshootingPage#ngdoc_vite_watch_capacity`).                                                 |
| `NGDOC_VITE_RESTART_REQUIRED`      | A setting that needs a restart changed (`*TroubleshootingPage#ngdoc_vite_restart_required`).                                                         |
| `NGDOC_VITE_OUTPUT_LEASE`          | Another plugin instance in the same Vite process already uses the same project or generated folder (`*TroubleshootingPage#ngdoc_vite_output_lease`). |
| `NGDOC_VITE_BUILD_WATCH`           | `vite build --watch` isn't supported.                                                                                                                |
| `NGDOC_VITE_WATCH_DISABLED`        | `server.watch` is disabled.                                                                                                                          |
| `NGDOC_VITE_HMR_DISABLED`          | `server.hmr` is disabled.                                                                                                                            |
| `NGDOC_VITE_THEME_MODULE`          | A Shiki theme other than the built-in ones has no entry in `themeModules`.                                                                           |
| `NGDOC_VITE_ANGULAR_COMPATIBILITY` | The Angular plugins don't come from `createNgDocAngularPlugins`.                                                                                     |
| `NGDOC_VITE_ANGULAR_OPTIONS`       | `createNgDocAngularPlugins` got an unsupported option value.                                                                                         |
| `NGDOC_VITE_ANGULAR_MODE`          | The plugins run in test mode (`NODE_ENV=test` or `VITEST`).                                                                                          |
| `NGDOC_VITE_ANGULAR_BUILD`         | `createNgDocAngularPlugins` was loaded from source instead of the built `@ng-doc/builder` package.                                                   |
| `NGDOC_VITE_ANGULAR_COMPOSITION`   | The Angular plugin array was changed: it must contain exactly the plugins that `createNgDocAngularPlugins` returns.                                  |
| `NGDOC_VITE_ANGULAR_PROBE`         | `angularComponentProbe` can't be read, or Angular didn't compile it. Point it to a component that the application always compiles.                   |

### Angular CLI builders

| Code                          | Meaning                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `NGDOC_ANGULAR_HIDDEN_OUTPUT` | In watch mode, the generated folder can't be inside a folder whose name starts with a dot. |

## Other codes

The remaining codes report internal failures of the engine, such as a compiler worker that crashed
(`WORKER_CRASH`) or timed out (`WORKER_COMPILE_TIMEOUT`). If one of them repeats, follow
`*TroubleshootingPage#worker-crashes-and-timeouts` and report it with the full message.

{% index false %}

## Related

- `*TroubleshootingPage`
- `*BuildersReference`

{% endindex %}
