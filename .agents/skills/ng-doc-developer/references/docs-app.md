# The documentation site (`apps/ng-doc`)

The site is NgDoc's own documentation, and it doubles as the largest real-world fixture for both engines.

- **Behaviour changes:** any change to how pages, demos, playgrounds, keywords or API docs behave should keep this site building and rendering the same way.
- **Documentation:** new author-facing features must be documented here, as a page or a section under `docs/`.

## Layout

| Path                                         | Role                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/`                                      | All documentation content (`docsPath` in `ng-doc.config.ts`).                                                                       |
| `docs/<category>/ng-doc.category.ts`         | A sidebar category.                                                                                                                 |
| `docs/**/<page>/ng-doc.page.ts` + `index.md` | A page.                                                                                                                             |
| `docs/shared/*.md`                           | Nunjucks includes shared by pages.                                                                                                  |
| `docs/ng-doc.api.ts`                         | API reference scopes (`app`, `builder`, `ui-kit`, `core`, `keywords-loaders`), each an include/exclude glob over library sources.   |
| `poc/` + `ng-doc.config.poc.ts`              | A small sandbox site for quick experiments (`npm run poc`, legacy engine).                                                          |
| `src/app/app.config.ts`                      | Wires `provideNgDocContext()` (from `@ng-doc/generated`), `provideNgDocApp`, search, the page skeleton, processors and Mermaid.     |
| `src/app/pages/docs/docs.routes.ts`          | Mounts `NG_DOC_ROUTING` from `@ng-doc/generated`.                                                                                   |
| `server.ts`, `src/main.server.ts`            | SSR / prerender entry points.                                                                                                       |
| `ng-doc.config.ts`                           | Site configuration (Vite engine): `docsPath`, `routePrefix: 'docs'`, `tsConfig`, keyword loaders, custom keywords, anchor headings. |
| `ng-doc.config.legacy.ts`                    | The same configuration for the legacy targets. Its output goes to `ng-doc-legacy/`.                                                 |

- **`@ng-doc/generated`:** an alias resolved to the engine's generated output. That output is `ng-doc/ng-doc/index.ts` for the Vite engine (`build`, `serve`), `ng-doc-legacy/ng-doc/ng-doc/index.ts` for the `*-legacy` targets, and a temporary directory for `serve-docs-vite.mjs`.
- **Generated output:** never edit it, and never import from it by relative path.

## Authoring cheatsheet

The guides under `docs/write-content/`, `docs/demos-and-playgrounds/` and `docs/document-your-api/`, and the tables under `docs/reference/`, are the authoritative reference. Read the relevant guide before changing a feature, because it shows the syntax users rely on.

**Page:**

```ts
import { provideTypeControl } from '@ng-doc/app';
import { NgDocPage } from '@ng-doc/core';
import { NgDocTagComponent } from '@ng-doc/ui-kit';

import WriteContentCategory from '../ng-doc.category';
import { ButtonDemoComponent } from './demos/button-demo.component';
import { MyControlComponent } from './my-control.component';

const MyPage: NgDocPage = {
  title: 'My page',
  mdFile: './index.md', // or ['./index.md', './other.md'] for tabs
  category: WriteContentCategory,
  order: 3,
  demos: { ButtonDemoComponent }, // standalone components rendered in markdown
  playgrounds: {
    TagPlayground: { target: NgDocTagComponent, template: `<ng-doc-selector>Tag</ng-doc-selector>` },
  },
  providers: [provideTypeControl('MyType', MyControlComponent, { hideLabel: true })],
  // also: imports, route, hidden, onlyForTags, data, disableFullscreenRoutes
};
export default MyPage;
```

A page's keyword goes in the markdown front matter, not in `ng-doc.page.ts`:

```md
---
keyword: 'MyPage'
---
```

**Category:**

```ts
import { NgDocCategory } from '@ng-doc/core';

const Category: NgDocCategory = { title: 'Write content', order: 2, expandable: true };
export default Category;
```

**Markdown actions:** the markdown is a Nunjucks template.

- `{{ NgDocActions.demo("ButtonDemoComponent", { expanded: true }) }}` and `{{ NgDocActions.demoPane("ButtonDemoComponent", { inputs: { color: "info" } }) }}` render a demo. A `fullscreenRoute` needs matching `route.children`.
- `{{ NgDocActions.playground("TagPlayground") }}` renders a playground.
- `{{ NgDocApi.api("libs/.../file.ts#Name") }}` and `{{ NgDocApi.details("...#Name") }}` render API tables and details.
- `JSDoc.description(...)`, `JSDoc.tag(...)` and `JSDoc.hasTag(...)` read doc comments.
- `{% include "../../shared/demo-inputs.md" %}` includes a shared file.
- `{{ NgDocPage.title }}` gives page data.
- To show template syntax literally, wrap it: `{{ '{{ NgDocActions.demo("X") }}' | safe }}`, or wrap a whole block (such as a code block with Angular template syntax) in `{% raw %}` … `{% endraw %}`.
- `<ng-doc-tab group="…" name="…" icon="…" active>` elements, with empty lines around their Markdown content, group any content (demos, playgrounds, text) into tabs (`write-content/content-tabs`); code groups use the same element.

**Keywords (auto-links):**

- **API declarations:** a declaration in an API scope links automatically when written as inline code, for example `` `NgDocPage` ``.
- **Page keywords:** the front-matter `keyword` is linked with `` `*MyPage` `` or `` `*MyPage#section` ``, and an API reference filter with `` `*ApiReferences?type=Class` ``.
- **External keywords:** these come from `keywords.keywords` and `keywords.loaders` in `ng-doc.config.ts`. The loaders live in `libs/keywords-loaders`.
- **Where a keyword links** (`libs/utils/html/plugins/keyword-positions.ts`, shared by both engines): inline code links when all of it is one keyword reference (`Key`, `Key.member`, `*Page#anchor`, with an optional `?query`; only this form fails the build on a missing page keyword or anchor), or when it reads as TypeScript (code punctuation, or a declaration at the start), in which case its words follow the code-block rules. Other inline code (file names such as `vite.ng-doc.config.mjs`, paths, commands, HTML tags, sentences) stays plain, so don't bold file names to dodge the linker. In TypeScript code blocks, strings, comments, template literal text (except Angular control flow such as `@if` and custom element names such as `<ng-content>`), object keys and declared names (before `:`, `?:`, `!:`, `=`), reserved words that aren't called, members after a dot (unless `Owner.member` is a keyword) and names bound by the example itself (`const`/`let`/`var`, relative imports) don't link. In HTML blocks, attribute values and comments don't link. Shiki leaves no token scopes in its output, so the rules read the code text; they never depend on the keyword set, which keeps the recorded used keywords exact.

**API reference:** `docs/ng-doc.api.ts` lists scopes, each with `include`/`exclude` globs over library sources. Every exported declaration in an included file is documented, whether or not a barrel re-exports it.

- **Coverage today:**
  - `app`, `ui-kit` and `core`: all sources, excluding specs, `testing/` folders, the Vitest configurations and test setup files.
  - `builder`: public interfaces only (`interfaces`, `types`, the schematic `schema.ts` files and the template globals in `engine/nunjucks/{actions,api,js-doc}.ts`). The rest of the legacy engine and the generator are not in the reference.
  - `keywords-loaders`: its `index.ts`.
  - `@ng-doc/utils` and `@ng-doc/add` have no scope.
- **New exported symbol:** exporting a declaration from a file inside a scope glob adds it to the reference, so keep its doc comment accurate.
- **Test fixtures:** keep them out of the scope globs, together with test and tool configuration files (`vitest.config.ts`): an exported default that is not a declaration is skipped with `SEMANTIC_DECLARATION_KIND`.
- **Keyword collisions:** an exported name that another scope, a pipe name or a keyword loader also defines is reported as `KEYWORD_DUPLICATE` in the serve and build output. Settle each one in `keywords.keywords` of `ng-doc.config.ts`: a url that is an API page's route (`/docs/api/...`) gives the keyword to that page, any other url replaces the loaders' keywords. Don't hide a barrel export with `@internal` to avoid a collision: that removes its API page. `@internal` is only for symbols that no public entry point exports and no docs or examples use.

## Working on the site

- **Demos:** demo and playground components follow the library conventions (standalone, OnPush, `inject()`, built-in control flow). See [angular-libraries.md](angular-libraries.md).
- **Running:** use the Vite/Analog dev host (`node tools/scripts/serve-docs-vite.mjs`, after building the packages) or `npx nx serve ng-doc` (the `vite-dev-server` builder) for new-engine work, and `npx nx run ng-doc:serve-legacy` to compare with the legacy engine. See [repo-and-commands.md](repo-and-commands.md).
- **Production check:** prerender every route, which is what the production build does. A page that renders in development but fails prerender is a bug.
