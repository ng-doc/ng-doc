---
keyword: ConfigurationReference
---

Every option of the configuration file, `ng-doc.config.ts`. The file default-exports an
`NgDocConfiguration` object. All options are optional.

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  routePrefix: 'docs',
};

export default config;
```

## Options

| Option            | Type                                                                        | Default                                                                       | Description                                                                                                 |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docsPath`        | `string`                                                                    | The folder that contains the application's `main.ts`                          | The folder with your pages, categories and API files, relative to the workspace root.                       |
| `outDir`          | `string`                                                                    | The workspace root                                                            | The parent folder of the generated folder. NgDoc writes to `<outDir>/ng-doc/<project-name>`.                |
| `routePrefix`     | `string`                                                                    | `''`                                                                          | A route segment added before every page route, such as `docs`.                                              |
| `tsConfig`        | `string`                                                                    | The application's TypeScript configuration                                    | The `tsconfig` file used to analyse your sources, relative to the workspace root.                           |
| `cache`           | `boolean`                                                                   | `true` in the new engine, `false` in the legacy builders                      | Reuses generated results between builds (`*PerformanceAndCachingPage`).                                     |
| `guide`           | `NgDocGuideConfiguration`                                                   | –                                                                             | Options for guide pages. See `*ConfigurationReference#guide`.                                               |
| `api`             | `NgDocApiConfiguration`                                                     | –                                                                             | Options for API pages (new engine only). See `*ConfigurationReference#api`.                                 |
| `isolatedDemos`   | `boolean`                                                                   | `false`                                                                       | Shows every demo in an iframe of its own page (new engine only). See `*ConfigurationReference#demo-pages`.  |
| `demoApplication` | `boolean \| NgDocDemoApplicationConfiguration`                              | –                                                                             | Which pages get demo pages, and their URL path (new engine only). See `*ConfigurationReference#demo-pages`. |
| `demoProviders`   | `NgDocDemoProvidersImport`                                                  | –                                                                             | Imports the providers of the demo pages (new engine only). See `*ConfigurationReference#demo-pages`.        |
| `shiki`           | `{ themes: { light: string; dark: string }; langs?: NgDocShikiLanguage[] }` | `css-variables` (new engine); `github-light` and `ayu-dark` (legacy builders) | The syntax highlighting themes, and extra languages (new engine only) (`*CodeHighlightingPage`).            |
| `repoConfig`      | `NgDocRepoConfig`                                                           | –                                                                             | Adds "Suggest edits" and "View source" links to pages. See `*ConfigurationReference#repoconfig`.            |
| `keywords`        | `NgDocKeywordsConfiguration`                                                | –                                                                             | Global keywords and keyword loaders. See `*ConfigurationReference#keywords`.                                |

## guide

| Option           | Type             | Default                    | Description                                                                         |
| ---------------- | ---------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `anchorHeadings` | `NgDocHeading[]` | `['h1', 'h2', 'h3', 'h4']` | The heading levels that get an anchor. Page keyword anchors use them too.           |
| `headerTemplate` | `string`         | The built-in header        | Path to an HTML file, relative to the workspace root, that renders the page header. |

The header template is a Nunjucks template, not Markdown. It can use these variables:

| Variable    | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| `NgDocPage` | The page configuration.                                             |
| `Metadata`  | The page's doc comment: `Metadata.description` and `Metadata.tags`. |

```twig name="header-template.html"
{{ "<h1>{{ NgDocPage.title }}</h1>" | safe }}

{{ "{{ Metadata.description }}" | safe }}
```

## api

Only the new engine reads these options.

| Option             | Type      | Default | Description                                                                                                                                     |
| ------------------ | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `protectedMembers` | `boolean` | `true`  | Lists the protected members of classes, inherited ones included. `false` lists public members only (`*GenerateApiPagesPage#protected-members`). |

## Demo pages

Only the new engine reads these options. Isolated demos show a demo's page in an iframe
(`*IsolatedDemosPage`).

| Option            | Type                                           | Default | Description                                                                                                                     |
| ----------------- | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `isolatedDemos`   | `boolean`                                      | `false` | Shows every demo in an iframe of its page, unless its `isolated` option is `false`. Every page with demos gets demo pages.      |
| `demoApplication` | `boolean \| NgDocDemoApplicationConfiguration` | –       | `true` or an object gives every page with demos its demo pages. `false` gives none, and isolated demos render in the page.      |
| `demoProviders`   | `NgDocDemoProvidersImport`                     | –       | `() => import('./demo.providers')`: the module whose default export, an `NgDocDemoProviders` list, provides for the demo pages. |

Without them, only the pages with an isolated demo get demo pages. `demoApplication` takes an
object with one option:

| Option | Type     | Default          | Description                                                                                           |
| ------ | -------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `path` | `string` | `'demo-preview'` | The URL path of the demo pages under the base href. URL segments that start with a letter or a digit. |

## repoConfig

| Option          | Type                   | Default    | Description                                                         |
| --------------- | ---------------------- | ---------- | ------------------------------------------------------------------- |
| `url`           | `string`               | –          | The repository URL, for example `https://github.com/ng-doc/ng-doc`. |
| `mainBranch`    | `string`               | –          | The branch that "Suggest edits" opens.                              |
| `releaseBranch` | `string`               | –          | The branch that "View source" opens.                                |
| `platform`      | `'github' \| 'gitlab'` | `'github'` | The hosting platform, which sets the link format.                   |

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

## keywords

| Option     | Type                                 | Description                                                                            |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `keywords` | `Record<string, NgDocGlobalKeyword>` | Global keywords. The key is the keyword (`*LinksAndKeywordsPage`).                     |
| `loaders`  | `NgDocKeywordsLoader[]`              | Functions that load global keywords when the build starts (`*LinkToExternalApisPage`). |

Each global keyword is an `NgDocGlobalKeyword`:

| Field         | Type     | Description                                |
| ------------- | -------- | ------------------------------------------ |
| `url`         | `string` | The link target.                           |
| `title`       | `string` | The link text. The key is used by default. |
| `description` | `string` | A tooltip shown on hover.                  |
| `type`        | `'link'` | How inline code with the keyword renders.  |

## Where NgDoc finds the file

NgDoc searches for the configuration file upward, folder by folder. The two engines start and
stop the search in different folders: the new engine stops at the workspace root, and the legacy
builders stop at your home directory.

| Engine          | Search starts in                                                           | File names                                                                       |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| New engine      | The parent of the default documentation folder, usually the project folder | `ng-doc.config.ts`, `ng-doc.config.js`, `ng-doc.config.mjs`, `ng-doc.config.cjs` |
| Legacy builders | The folder of the `browser` entry file, usually `src`                      | `ng-doc.config.ts`, `ng-doc.config.js`                                           |

So a file in `src/ng-doc.config.ts` is found only by the legacy builders. Put the file in the
project folder or at the workspace root, where both engines find it.

The Vite plugin's `generator.configFile`, the `--config` flag of the `ng-doc` command, or the
`ngDoc.config` option of the legacy builders can point to a specific file instead. See
`*BuildersReference` and `*LegacyBuildersPage`. Without a configuration file, every option keeps its
default.

## Defaults per engine

| Setting              | New engine                                                                  | Legacy builders                                  |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| `cache`              | `true`                                                                      | `false`                                          |
| Cache folder         | `.cache/ng-doc/<project-name>`                                              | `node_modules/.cache/ng-doc`                     |
| Generated folder     | `ng-doc/<project-name>` (`.ng-doc/<project-name>` for the `ng-doc` command) | `ng-doc/<project-name>`                          |
| Configuration search | Starts in the parent of the documentation folder                            | Starts in the folder of the `browser` entry file |

Paths are relative to the workspace root. The `ng-doc` command line interface uses its own defaults
for the documentation, generated and cache folders (`*BuildersReference`).

{% index false %}

## Related

- `*PageFilesReference`
- `*BuildersReference`
- `*PerformanceAndCachingPage`

{% endindex %}
