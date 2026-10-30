---
keyword: UiTextsPage
---

NgDoc shows a few hundred words of its own around your content: the search field and the search
palette, the demo toolbar, the playground inspector, copy buttons, the navigation, the table of
contents, the theme button and the API list, and the accessible names of their controls. They are
in English by default. `provideNgDocTexts` changes any of them, for example to translate the site.

## 👀 See it

This site keeps the English texts. With the providers below, the search field in the navbar reads
"Dokumentation durchsuchen…", the palette answers "Keine Ergebnisse für „Knopf“", and the table of
contents is titled "Auf dieser Seite".

## 🧰 Use it

Add `provideNgDocTexts` to the providers of your application and pass the texts to change, by
group. Every text you leave out keeps its English default:

```typescript name="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideNgDocTexts } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgDocTexts({
      search: {
        placeholder: 'Dokumentation durchsuchen…',
        label: ({ shortcut }) => `Suche (${shortcut})`,
        shortcutOther: 'Strg K',
      },
      searchPalette: {
        inputPlaceholder: 'Anleitungen, API und Aktionen durchsuchen…',
        noResults: ({ query }) => `Keine Ergebnisse für „${query}“`,
        statusResults: ({ scope, count }) => `${scope}: ${count} ${count === 1 ? 'Ergebnis' : 'Ergebnisse'}.`,
      },
      toc: { onThisPage: 'Auf dieser Seite', backToTop: 'Nach oben' },
      navigation: { previous: 'Zurück', next: 'Weiter' },
      blockquote: { note: 'Hinweis', warning: 'Warnung' },
    }),
  ],
};
```

The keys are typed: your editor completes the groups and their texts, and a misspelled key is a
compile error.

### Texts with values

A text that contains a value, such as the query or a number of results, is a function. It
receives the values as one object and returns the text, so a translation can put the values where
its language needs them and choose a plural form:

```typescript
provideNgDocTexts({
  apiList: {
    summary: ({ declarations, scopes }) => `${declarations} Deklarationen in ${scopes} ${scopes === 1 ? 'Bereich' : 'Bereichen'}.`,
  },
});
```

The description of each text names its values.

### Several calls

You can call `provideNgDocTexts` more than once, for example once for a shared translation and
once for the texts of one site:

- In the same providers, the calls apply in order: when two calls set the same text, the later one
  wins. The other texts of a group are kept.
- The providers of a lazy route or of a page apply on top of the texts of the application, so a
  part of the site can change a few texts and keep the rest.

### Use the texts in your own components

Inject `NG_DOC_TEXTS` to show the same words in your own components, such as a custom navbar:

```typescript name="my-navbar.component.ts"
import { Component, inject } from '@angular/core';
import { NG_DOC_TEXTS } from '@ng-doc/app';

@Component({
  selector: 'app-navbar',
  template: `<a href="#main">{{ texts.skipToContent }}</a>`,
})
export class MyNavbarComponent {
  protected readonly texts = inject(NG_DOC_TEXTS).navigation;
}
```

## 📋 Texts

`NgDocTexts` holds every text, in these groups. The API page of each group lists its texts with
their English default, and `NG_DOC_DEFAULT_TEXTS` holds the defaults.

| Group           | Interface                 | Texts of                                                                                           |
| --------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `search`        | `NgDocSearchTexts`        | The search field in the navbar and its shortcut, and the search result list.                       |
| `searchPalette` | `NgDocSearchPaletteTexts` | The search palette: field, scopes, sections, messages, announcements, footer and actions.          |
| `copy`          | `NgDocCopyTexts`          | Copy buttons and their confirmation.                                                               |
| `demo`          | `NgDocDemoTexts`          | The demo toolbar (views, preview widths, new tab, fullscreen), demo code and isolated demos.       |
| `playground`    | `NgDocPlaygroundTexts`    | The playground inspector: title, Reset, Recreate, sections and the default value of a union type.  |
| `navigation`    | `NgDocNavigationTexts`    | The skip link, the menu button, the sidebar, the breadcrumbs and the previous and next page links. |
| `page`          | `NgDocPageTexts`          | The page controls (copy link, edit, view source) and the way back from a fullscreen route.         |
| `content`       | `NgDocContentTexts`       | Images that open larger and the highlighted lines of code blocks.                                  |
| `toc`           | `NgDocTocTexts`           | The table of contents and its actions.                                                             |
| `theme`         | `NgDocThemeTexts`         | The theme button and the names of the themes.                                                      |
| `apiList`       | `NgDocApiListTexts`       | The API list: summary, filter, grouping, kinds and messages.                                       |
| `blockquote`    | `NgDocBlockquoteTexts`    | The titles of the callouts (Note, Warning, Alert, Success).                                        |
| `pane`          | `NgDocPaneTexts`          | The resizer of the demo pane.                                                                      |
| `combobox`      | `NgDocComboboxTexts`      | The placeholder of the select, which the playground uses for union types.                          |

The last three groups belong to `@ng-doc/ui-kit` (`NgDocUiKitTexts`, `NG_DOC_UI_KIT_TEXTS`);
`provideNgDocTexts` sets them too.

## 🚧 Gotchas

> **Note**
> The texts are read when a component is created, and they stay the same for the life of the
> injector. To switch the language, load the application again with other providers, for example
> one build per language.

> **Note** > `provideNgDocTexts` covers the texts of the application. It doesn't cover the text that the
> builder writes into the generated pages (the headings and labels of API pages, such as
> Parameters, Returns and Members, and their members filter), the message of a demo page that
> doesn't exist, or names: the kinds of declarations (Class, Type alias) and the languages of code
> blocks (TypeScript). Your own content, such as page and category titles, stays as you write it.

> **Note**
> Set the `lang` attribute of the `html` element in your `index.html` to the language of the
> texts, so screen readers pronounce them correctly.

{% index false %}

## Related

- `*AppProvidersReference`
- `*SearchPage`
- `*BrowserTabTitlesPage`

{% endindex %}

Next: `*DevServerAndBuildsPage`
