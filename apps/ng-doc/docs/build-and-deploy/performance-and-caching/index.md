---
keyword: PerformanceAndCachingPage
---

The new engine caches its results and rebuilds only what changed. This page explains the cache, how
to keep it in CI, and what keeps edits fast.

## The cache

The cache is on by default. It stores the generated result of every page together with a
fingerprint of its inputs. On the next build, NgDoc reuses a result when its fingerprint still
matches, and rebuilds it when an input changed.

| Host             | Cache folder                                      |
| ---------------- | ------------------------------------------------- |
| Vite host        | `generator.defaults.cacheRoot` of the Vite plugin |
| `ng-doc` command | `.cache/ng-doc/<project-name>`, or `--cache-root` |

Add the folder to `.gitignore`:

```gitignore name=".gitignore"
/.cache
```

To turn the cache off, set `cache: false` in the configuration file:

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  cache: false,
};

export default config;
```

The legacy builders keep a different cache, which is off by default: see `*LegacyBuildersPage`.

## Clear the cache

Delete the cache folder. The next build rebuilds everything and fills the cache again.

You rarely need to. Outdated entries are rebuilt without a message. NgDoc reports an
`ARTIFACT_CACHE_*` warning only when an entry is unreadable or inconsistent, for example after an
interrupted write or a manual edit. It ignores that entry and rebuilds it
(`*DiagnosticCodesReference`).

## Cache in CI

Save the cache folder between CI runs to speed up production builds. Restore it before the build and
save it after. Because every entry is checked, a cache from an older commit or another NgDoc version
is safe to restore: outdated entries are rebuilt.

## ⚡ What keeps edits fast

In the development server:

- NgDoc watches every file that a page depends on, and rebuilds only the pages that depend on the
  changed file.
- A long-running compiler worker keeps the TypeScript program between edits, so an edit doesn't
  start the analysis from scratch.
- The worker prepares the program while the server is idle, so the first edit is fast too.
- A restart with the cache on checks every file the last run read, by its content. When none of
  them changed, NgDoc publishes the pages of that run without generating them again, and the
  worker prepares the program in the background (an edit made before it is ready rebuilds every
  page once). When some changed, only the changed pages are rendered again, and the others reuse
  their cached links and generated files.
- Highlighted code is kept in the cache folder too, so code that NgDoc highlighted before is not
  highlighted again, even on pages that are rendered again.
- A start that renders many pages, like a production build, processes their HTML (highlighting,
  links and search records) on up to four worker threads, while the compiler prepares the next
  pages.

Each of these has an environment switch that turns it off (`*BuildersReference#environment-switches`).
Use them only to find the cause of a problem.

To keep builds fast, keep your API scopes to the files that readers need: every included file is
analysed.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*ConfigurationReference`
- `*TroubleshootingPage`

{% endindex %}

Next: `*TroubleshootingPage`
