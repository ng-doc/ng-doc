# Code style and conventions

Tooling enforces most of this. Run `npx nx lint <project>` and `npx nx format:write` before you finish. The pre-commit hook runs both on staged files.

## Formatting (Prettier + EditorConfig)

- Two-space indent, UTF-8, final newline, trimmed trailing whitespace.
- Maximum line length is 100; Markdown is exempt.
- Single quotes, semicolons, trailing commas everywhere (`"all"`), `bracketSameLine: true`.
- `*.ts.nunj` templates are formatted with the TypeScript parser.
- Don't hand-format against Prettier, and don't reformat files you didn't otherwise change.

## TypeScript (root `eslint.config.mjs`)

- **Imports and exports:** sorted by `simple-import-sort` (the `--fix` autofix is fine). It uses the default groups: side-effect imports, `node:` built-ins, packages (including `@ng-doc/*` aliases), absolute, then relative.
- **Object shapes:** `interface`, not `type` (`consistent-type-definitions`). Use `type` for unions, mapped and conditional types.
- **Array types:** `T[]` for simple element types, `Array<Foo<Bar>>` for complex ones (`array-type: array-simple`).
- **Type annotations:** required on function and method parameters, and on interface or type-literal properties (`typedef`). Class fields, local variables and arrow parameters may be inferred.
- **Member accessibility:** no `public` modifier (`explicit-member-accessibility: no-public`). Use `private`/`protected`/`readonly` where they apply.
- **Declarations:** `prefer-const`.
- **`any`:** it is a warning; prefer `unknown` plus narrowing.
- **Non-null assertions:** they warn everywhere except `*.spec.ts`.
- **JSDoc:** `eslint-plugin-jsdoc` recommended rules apply. Parameter and return _types_ are not written in JSDoc; TypeScript provides them.
- **Module boundaries** (`@nx/enforce-module-boundaries`):

  | Project                         | May import            |
  | ------------------------------- | --------------------- |
  | app                             | builder, ui-kit, core |
  | builder                         | core, utils           |
  | ui-kit, utils, keywords-loaders | core only             |
  | the site (`type:app`)           | libraries only        |

  Import libraries through their `@ng-doc/*` alias, never by a relative path into another project.

- **Compiler settings:** the base config (`tsconfig.base.json`) is `strict` TypeScript with `target`/`lib` ES2022, `experimentalDecorators` and `useDefineForClassFields: false`, which matters for Angular inputs. Some projects override it: `libs/builder` sets `experimentalDecorators: false`, `libs/core` targets ES2020 and `libs/utils` targets ES2023. Check the project's own `tsconfig.json`.

## Naming and files

- **File names:** kebab-case (`build-session.ts`, `button.component.ts`). Angular files use the `.component|.directive|.pipe|.service.ts` suffixes.
- **Angular public classes:** use the `NgDoc` prefix (`NgDocButtonComponent`, `NgDocRotatorDirective`).
- **Selectors:** components use the `ng-doc-` prefix. Directives use attribute selectors with the `ngDoc` prefix.
- **Generator code:**
  - Services are created by factories: `createBuildSession`, `createCompilationService`, `createOutputCommitter`.
  - Stateful implementations are classes (`GeneratorBuildSession`, `TransactionalOutputCommitter`, `JsonArtifactCache`).
  - Ports are interfaces in `contracts.ts`.
- **Diagnostic codes:** `UPPER_SNAKE` with a module prefix (`OUTPUT_PATH_COLLISION`). Host error messages start with a bracketed code (`[NGDOC_VITE_CONFIGURATION] …`).
- **Environment switches:** `NGDOC_*`, declared as an exported constant next to the option they override. Copy one only when a process boundary requires it (as `worker/index.ts` does for `NGDOC_INCREMENTAL_SKIP`).

## Comments

- **What to comment:** the _why_: invariants, ordering and concurrency constraints, platform quirks, and why a check exists. Generator code is intentionally well commented because its correctness rules are not obvious from the code. Keep that density for new engine code, and keep comments accurate when you change behaviour.
- **What not to comment:** don't restate the code. Don't leave commented-out code.
- **Public APIs** of the libraries need JSDoc. For files included by the scopes in `apps/ng-doc/docs/ng-doc.api.ts`, the JSDoc is rendered in NgDoc's own API reference, so it is user-facing documentation.
- **Self-contained comments:** don't put internal task numbers, ticket IDs or planning-document references in new comments. State the reason itself so the comment stays meaningful after the plan is gone.

## Generator-specific style

- **Data across boundaries:** use plain JSON data (DTOs in `contracts.ts`). No class instances, functions, `Map`s or `BigInt`s in anything that is cached, persisted or sent to a worker.
- **Immutability:** prefer it. Freeze shared snapshots (`Object.freeze`, `deepFreeze`), use `readonly` fields, and copy explicitly with `structuredClone` when ownership changes.
- **Errors:** return a `Diagnostic` with a code and `stage` instead of throwing inside services. Throw only at host boundaries or for programmer errors.
- **Determinism:** sort collections before hashing or emitting, and use stable serialization (`stable` / `hash` in `compiler/common.ts`).
- **Async work:** honour the `AbortSignal` passed in. Every started process, watcher or timer must be joined or disposed on every path (success, failure, abort, dispose).
- **Node built-ins:** import them with the `node:` prefix (`node:fs/promises`, `node:path`).
- **Tool scripts:** scripts in `tools/scripts` are plain Node ESM (`.mjs`) with no build step. They are tested with `node --test`. After touching any tool script, run `node --test tools/scripts/testing/*.test.mjs`; CI runs only `check-builder-modernization.test.mjs`.

## Tests

| Code                                            | Framework                                   | Location                                                             |
| ----------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `libs/app`, `libs/ui-kit`, `apps/ng-doc`        | Vitest through `@angular/build:unit-test`   | `*.spec.ts` next to the source or under `testing/`                   |
| `libs/core`, `utils`, `keywords-loaders`, `add` | Vitest (`vitest.config.ts` in the project)  | `*.spec.ts` next to the source (`add`: `schematics/ng-add/testing/`) |
| `libs/builder` (legacy)                         | Vitest (`libs/builder/vitest.config.ts`)    | `*.spec.ts`                                                          |
| `libs/builder/generator`                        | Vitest (`*.vitest.ts` and some `*.spec.ts`) | See [builder-testing.md](builder-testing.md)                         |
| `tools/scripts`                                 | `node:test`                                 | `tools/scripts/testing/*.test.mjs`                                   |

- **Where tests go:** add or update tests in the same change as the behaviour. Match the framework already used by the area.
- **Vitest style:** import `describe`, `it`, `expect`, `vi` and the hooks from `vitest` explicitly (the Node configs set `globals: false`). Vitest does not type-check: the Angular unit-test builder compiles the `app`, `ui-kit` and site specs with the full type checker, and `nx test add` runs `tsc` on its spec tsconfig first.
- **Test data:** use temporary directories (`mkdtemp`) and clean them up. Never write fixtures into the repository tree.

## Commits

- **Format:** Conventional Commits, enforced by commitlint (`@commitlint/config-conventional`; no header length limit).
- **Shape:** `type(scope): imperative summary`, for example `fix(builder): keep watch inputs after a failed generation`.
- **Scope:** usually `builder`, `app`, `ui-kit`, `core`, `utils`, `keywords-loaders`, `add`, `ng-doc` (the site) or `project` (repo-wide tooling). `angular` is used only for Angular major upgrades.
- **Breaking changes:** put a `BREAKING CHANGE: <what and how to migrate>` footer in the body. Don't use `!` in the header. The release parser (semantic-release, angular preset) doesn't read it: a `!` header loses its type and scope, and with `!` and no footer no release happens at all. commitlint accepts `!`, so the hook won't catch this.
- **Release impact:** only `feat`, `fix`, `perf` and `revert` produce a release. A breaking change produces a **minor** release, except with scope `angular`, which produces a **major** one (`releaseRules` in `release.config.js`). NgDoc majors follow Angular majors: for example, `feat(angular): angular 21 support` released 21.0.0. So keep `angular` for the Angular upgrade.
- **When to commit:** agents commit only when asked.
