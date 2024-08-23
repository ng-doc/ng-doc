---
keyword: MermaidDiagramsPage
---

Mermaid is a diagramming and charting tool that produces beautiful diagrams from simple text
descriptions. It is a great way to create diagrams for your documentation.

## Enabling Mermaid diagrams

This feature is off by default because diagrams can be heavy and increase the size of your
bundle which is not necessary for all users. To enable it, you need to add the `provideMermaid`
function to your bootstrap providers.

```typescript name="main.ts" {3,14}
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideMermaid } from '@ng-doc/app';
import { NG_DOC_ROUTING, provideNgDocContext } from '@ng-doc/generated';

import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [provideMermaid()],
}).catch((err: unknown) => console.error(err));
```

`provideMermaid` function also accepts an optional configuration object that you can use to customize
the mermaid diagrams. For more details check the `mermaid` documentation.

## Using Mermaid diagrams

To use Mermaid diagrams in your markdown files, you need to specify the `mermaid` language in the code
block. Here is an example of a simple flowchart:

````md name="index.md"
```mermaid
graph TD;
  A-->B;
  A-->C;
  B-->D;
  C-->D;
```
````

```mermaid
graph TD;
  A-->B;
  A-->C;
  B-->D;
  C-->D;
```
