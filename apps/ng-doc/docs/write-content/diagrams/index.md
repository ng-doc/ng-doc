---
keyword: DiagramsPage
---

Draw flowcharts, sequence diagrams and other charts from plain text with `mermaid`. The diagram
source stays in the Markdown file, so it is easy to review and update.

## 👀 See it

```mermaid
flowchart LR
  page["ng-doc.page.ts"] --> markdown["index.md"]
  markdown --> html["Rendered page"]
  api["ng-doc.api.ts"] --> html
```

## 🧰 Use it

Diagrams are off by default because the Mermaid library is large. Add `provideMermaid()` to the
providers of your application:

```typescript name="app.config.ts" {2,6}
import { ApplicationConfig } from '@angular/core';
import { provideMermaid } from '@ng-doc/app';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMermaid(),
    // ...the other NgDoc providers
  ],
};
```

Then write a code block with the `mermaid` language:

````markdown name="index.md"
```mermaid
flowchart LR
  page["ng-doc.page.ts"] --> markdown["index.md"]
  markdown --> html["Rendered page"]
  api["ng-doc.api.ts"] --> html
```
````

## 📋 Options

`provideMermaid` accepts a Mermaid configuration object and passes it to Mermaid's `initialize()` function.
NgDoc renders diagrams itself, so it always sets `startOnLoad` to `false`.

```typescript name="app.config.ts"
provideMermaid({ theme: 'neutral' });
```

## Sequence diagrams

````markdown name="index.md"
```mermaid
sequenceDiagram
  participant Author
  participant NgDoc
  participant Browser
  Author->>NgDoc: Save index.md
  NgDoc->>Browser: Updated page
```
````

```mermaid
sequenceDiagram
  participant Author
  participant NgDoc
  participant Browser
  Author->>NgDoc: Save index.md
  NgDoc->>Browser: Updated page
```

## 🚧 Gotchas

> **Warning**
> Without `provideMermaid()`, a page with a `mermaid` block throws the error "Mermaid is not
> provided" when the page renders, and the diagram doesn't appear.

{% index false %}

## Related

- `*CodeBlocksPage`
- `*AppProvidersReference`

{% endindex %}

Next: `*LinksAndKeywordsPage`
