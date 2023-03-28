# {{NgDocPage.title}}

This article describes how to customize the search functionality of the documentation
and how to create a custom search.

## Language

By default, the search is configured to search in English. If your documentation is in another
language, you can change the language of the search to match your documentation.
To do so, you need to provide the preferred language to the `provideSearchEngine` function
in your root module.

```ts fileName="app.module.ts"
import {NgModule} from '@angular/core';
import {NgDocDefaultSearchEngine, provideSearchEngine} from '@ng-doc/app';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    // ...
  ],
  providers: [provideSearchEngine(NgDocDefaultSearchEngine, 'dutch')],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## Custom Search Engine

You can create your own search engine that will be used by the `NgDocSearchComponent` in the navbar.
To do so, you need to implement the `NgDocSearchEngine` class and provide it via
`provideSearchEngine` function in your root module.

> **Note**
> To get data for search, you can load indexes via HTTP, by default they can be loaded from assets
> using `assets/ng-doc/indexes.json` url.

```ts fileName="custom-search-engine.ts"
import {NgDocSearchEngine, NgDocSearchResult} from '@ng-doc/app';
import {NgDocPageSectionIndex} from '@ng-doc/core';
import {from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

export class CustomSearchEngine extends NgDocSearchEngine {
  // Load indexes from assets
  indexes: Observable<NgDocPageSectionIndex[]> = from(fetch(`assets/ng-doc/indexes.json`)).pipe(
    switchMap((response: Response) => response.json() as Promise<NgDocPageSectionIndex[]>),
    // Use `shareReplay(1)` to cache the response and avoid making multiple requests
    shareReplay(1),
  );

  search(query: string): Observable<NgDocSearchResult[]> {
    return this.indexes.pipe(map((indexes: NgDocPageSectionIndex[]) => this.filterIndexes(indexes, query)));
  }

  private filterIndexes(indexes: NgDocPageSectionIndex[], query: string): NgDocSearchResult[] {
    return (
      indexes
        // Filter indexes by query
        .filter((index: NgDocPageSectionIndex) => index.content.toLowerCase().includes(query.toLowerCase()))
        // Get first 10 results, you can remove this line to get all results
        // it's recommended to limit the number of results to avoid performance issues
        .slice(0, 10)
        // Map indexes to search results
        .map((index: NgDocPageSectionIndex) => ({
          index,
          // You can provide a list of positions where the query was found in the title
          // then the search component will highlight them
          positions: {
            // Provide the key of the section where the query was found and it's position
            content: [
              {
                start: index.content.toLowerCase().indexOf(query.toLowerCase()),
                length: query.length,
              },
            ],
          },
        }))
    );
  }
}
```

After you have created your search engine, you need to provide it in your root module using
`provideSearchEngine` function.

```ts fileName="app.module.ts"
import {NgModule} from '@angular/core';
import {provideSearchEngine} from '@ng-doc/app';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    // ...
  ],
  providers: [provideSearchEngine(CustomSearchEngine, 'dutch')],
  bootstrap: [AppComponent],
})
export class AppModule {}
```
