---
keyword: SearchPage
---

The search field in the navbar opens the command palette: one dialog that searches the guides and
the API, and runs actions such as switching the theme. This page shows how readers use it, and how
you configure the search engine behind it or replace it.

## See it

Press ⌘K on macOS or Ctrl+K elsewhere, or click the search field in the navbar.

The palette has four scopes: **All**, **Guides**, **API** and **Actions**. Results are grouped by
type, with guides above the API, and a preview of the selected result shows beside the list on wide
screens. In **All**, declarations whose name starts with the query (three letters or more) are
listed first as **Top matches**, so Enter opens the symbol you typed.

| Key                | In the palette                                         |
| ------------------ | ------------------------------------------------------ |
| ↑ and ↓            | Select the previous or next result.                    |
| Enter              | Open the selected result, or run the selected action.  |
| Tab                | Move to the scopes and the shortcuts switch, and back. |
| ← and → on a scope | Select another scope.                                  |
| Esc                | Close the palette. Focus returns to where it was.      |

The **Actions** scope lists **Toggle dark mode**, **Copy link to this page** and the switch for
single-key shortcuts.

## Set it up

The palette needs a search engine. `ng add` provides the default one:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NgDocDefaultSearchEngine, provideSearchEngine } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [provideSearchEngine(NgDocDefaultSearchEngine)],
};
```

The engine loads the search index that NgDoc generates, `assets/ng-doc/indexes.json`, the first
time a reader searches. The API scope also matches declaration names directly, from the generated
API lists.

To hide the search field, set `search` to `false` on the navbar:

```html name="app.component.html"
<ng-doc-navbar [search]="false" />
```

## Keyboard shortcuts

Besides ⌘K and Ctrl+K, NgDoc has single-key shortcuts:

| Key       | Action                                                  |
| --------- | ------------------------------------------------------- |
| `/`       | Open the search.                                        |
| `[` / `]` | Go to the previous or next page.                        |
| `F`       | Focus the filter of the API index or the members table. |
| `L`       | Copy the link to the page.                              |
| `T`       | Switch between the light and the dark theme.            |

Single-key shortcuts don't run while the reader types in a field, uses a list, or works in a demo
or a playground, and never with ⌘, Ctrl or Alt held. ⌘K and Ctrl+K always work.

Readers turn single-key shortcuts off or on with the **Single-key shortcuts** switch at the bottom
of the palette, and NgDoc saves the choice in the browser. To turn them off by default, pass
`shortcuts: false` to `provideNgDocApp`:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideNgDocApp } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [provideNgDocApp({ shortcuts: false })],
};
```

### Add a shortcut

Register your own shortcut with `NgDocShortcutsService`. `register()` returns a function that
removes it:

```typescript name="app.component.ts"
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgDocShortcutsService } from '@ng-doc/app';

@Component({
  selector: 'app-root',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);

  constructor() {
    const remove = inject(NgDocShortcutsService).register({
      key: 'g',
      handler: () => void this.router.navigateByUrl('/docs/get-started/installation'),
    });

    inject(DestroyRef).onDestroy(remove);
  }
}
```

A shortcut without `chord` is a single key: it follows the reader's switch and the rules above. With
`chord: true`, it runs with ⌘ on macOS or Ctrl elsewhere, and always works. When two shortcuts use
the same key, the one registered last runs, until it is removed.

## Configure the default engine

Pass options to `NgDocDefaultSearchEngine` as the second argument of `provideSearchEngine`:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NgDocDefaultSearchEngine, provideSearchEngine } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [provideSearchEngine(NgDocDefaultSearchEngine, { limit: 20, tolerance: 1 })],
};
```

`*AppProvidersReference#providesearchengine` lists every option.

### Language

The default engine stems words in English. If your documentation is in another language, pass a
stemmer for it from `@orama/stemmers`, which `@ng-doc/app` installs:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { NgDocDefaultSearchEngine, provideSearchEngine } from '@ng-doc/app';
import { stemmer } from '@orama/stemmers/dutch';

export const appConfig: ApplicationConfig = {
  providers: [provideSearchEngine(NgDocDefaultSearchEngine, { stemmer })],
};
```

### Exclude content

NgDoc indexes the text of every page except code blocks. To keep a part of a page out of the index,
wrap it in `index false` (`*TemplatesPage#exclude-content-from-search`).

## Custom search engine

To search another way, for example with a hosted search service, extend `NgDocSearchEngine` and
implement `search()`. It returns an Observable of `NgDocSearchResult` objects: the `index` record of
a page section, and optionally the `positions` of the matches to highlight.

This engine loads the generated index and matches the query as plain text:

```typescript name="text-search-engine.ts"
import { NgDocSearchEngine, NgDocSearchResult } from '@ng-doc/app';
import { NgDocPageIndex } from '@ng-doc/core';
import { defer, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

export class TextSearchEngine extends NgDocSearchEngine {
  private readonly indexes: Observable<NgDocPageIndex[]> = defer(() => fetch('assets/ng-doc/indexes.json').then((response: Response) => response.json() as Promise<NgDocPageIndex[]>)).pipe(shareReplay(1));

  search(query: string): Observable<NgDocSearchResult[]> {
    const text: string = query.toLowerCase();

    return this.indexes.pipe(
      map((indexes: NgDocPageIndex[]) =>
        indexes
          .filter((index: NgDocPageIndex) => (index.content ?? '').toLowerCase().includes(text))
          .slice(0, 10)
          .map((index: NgDocPageIndex) => ({
            index,
            positions: {
              content: [{ start: (index.content ?? '').toLowerCase().indexOf(text), length: text.length }],
            },
          })),
      ),
    );
  }
}
```

Provide it instead of the default engine. The arguments after the class are passed to its
constructor:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideSearchEngine } from '@ng-doc/app';

import { TextSearchEngine } from './text-search-engine';

export const appConfig: ApplicationConfig = {
  providers: [provideSearchEngine(TextSearchEngine)],
};
```

## Gotchas

> **Warning**
> The `ng-doc-search` component throws an error when no search engine is provided. Provide one, or hide the search
> field with `[search]="false"`.

{% index false %}

## Related

- `*LayoutPage#navbar`
- `*TemplatesPage#exclude-content-from-search`
- `*AppProvidersReference#providesearchengine`

{% endindex %}

Next: `*CustomPageComponentsPage`
