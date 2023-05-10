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
  providers: [provideSearchEngine(NgDocDefaultSearchEngine, {language: 'dutch'})],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## Configuration

You can configure the default search engine by providing the `NgDocDefaultSearchEngineOptions`
object to the `provideSearchEngine` function in your root module.

For example, increasing the number of results returned by the search engine:

```ts fileName="app.module.ts"
import {NgModule} from '@angular/core';
import {NgDocDefaultSearchEngine, provideSearchEngine} from '@ng-doc/app';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    // ...
  ],
  providers: [provideSearchEngine(NgDocDefaultSearchEngine, {limit: 20})],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## Avoiding Indexing

By default, builder creates indexes for all content of the documentation except code blocks.
If you want to exclude some content from the search, you can wrap in special `nunjucks` block:

```twig fileName="index.md"
{{'{% index false %}' | safe }}
## Not indexed section
The content of this section will not be indexed by the builder.
{{'{% endindex %}' | safe }}
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
import {NgDocPageIndex} from '@ng-doc/core';
import {from, Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';

export class CustomSearchEngine extends NgDocSearchEngine {
  // Load indexes from assets
  indexes: Observable<NgDocPageIndex[]> = from(fetch(`assets/ng-doc/indexes.json`)).pipe(
    switchMap((response: Response) => response.json() as Promise<NgDocPageIndex[]>),
    // Use `shareReplay(1)` to cache the response and avoid making multiple requests
    shareReplay(1),
  );

  search(query: string): Observable<NgDocSearchResult[]> {
    return this.indexes.pipe(map((indexes: NgDocPageIndex[]) => this.filterIndexes(indexes, query)));
  }

  private filterIndexes(indexes: NgDocPageIndex[], query: string): NgDocSearchResult[] {
    return (
      indexes
        // Filter indexes by query
        .filter((index: NgDocPageIndex) => index.content.toLowerCase().includes(query.toLowerCase()))
        // Get first 10 results, you can remove this line to get all results
        // it's recommended to limit the number of results to avoid performance issues
        .slice(0, 10)
        // Map indexes to search results
        .map((index: NgDocPageIndex) => ({
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
  providers: [provideSearchEngine(CustomSearchEngine)],
  bootstrap: [AppComponent],
})
export class AppModule {}
```
