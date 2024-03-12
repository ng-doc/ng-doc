// @ts-nocheck
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { NgDocDemoAssets, NgDocPageComponent, NgDocRootPage } from '@ng-doc/app';
import { isRoute, NgDocPage, NgDocPageType } from '@ng-doc/core';

const pageContent: string = `<header class="ngde"><div class="ng-doc-page-tags ngde"><span class="ng-doc-tag ngde" indexable="false" data-content="ng-doc-scope">ng-doc</span> <span class="ng-doc-inline-delimiter ngde" indexable="false">/</span> <span class="ng-doc-tag ngde" indexable="false" data-content="Class">Class</span> <span class="ng-doc-inline-delimiter ngde" indexable="false">/</span><div class="ng-doc-decorators-group ngde" indexable="false"><code class="ngde">@Pipe</code></div></div><h1 id="formatdatepipe" class="ngde">FormatDatePipe<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/FormatDatePipe#formatdatepipe"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h1><!-- This is a hack to make the declaration name available to the search index. --><div style="display: none" class="ngde">%%API_NAME_ANCHOR%%</div><div class="ng-doc-header-details ngde" indexable="false"><span class="ng-doc-header-details-label ngde">Implements</span><code indexable="false" class="ngde">PipeTransform</code></div></header><section class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></section><section class="ngde"><h2 id="methods" class="ngde">Methods<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/FormatDatePipe#methods"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h2><div class="ng-doc-table-wrapper ngde"><table class="ng-doc-method-table ngde"><thead class="ngde"><tr class="ngde"><th indexable="false" class="ngde"><h3 data-slugtype="member" id="transform" class="ngde">transform()<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/FormatDatePipe#transform"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h3><div class="ng-doc-node-details ngde">implements <code class="ngde">PipeTransform</code></div></th></tr></thead><tbody class="ngde"><tr class="ngde"><td class="ngde"><p class="ngde">Transform pipe method</p></td></tr><tr class="ngde"><td class="ngde"><h5 class="no-anchor ngde" indexable="false">Presentation</h5><pre class="ngde hljs"><code lang="typescript" class="hljs language-typescript code-lines ngde"><span class="line ngde"><span class="hljs-title function_ ngde">transform</span>(<span class="hljs-attr ngde">value</span>: <span class="hljs-built_in ngde">string</span>, <span class="hljs-attr ngde">display</span>: <span class="hljs-string ngde">"date"</span> | <span class="hljs-string ngde">"time"</span> | <span class="hljs-string ngde">"datetime"</span> = <span class="hljs-string ngde">'datetime'</span>, <span class="hljs-attr ngde">utc</span>: <span class="hljs-built_in ngde">boolean</span>): <span class="hljs-built_in ngde">string</span>;
</span></code></pre></td></tr><tr class="ngde"><td class="ngde"><h5 class="no-anchor ngde" indexable="false">Parameters</h5><div class="ng-doc-table-wrapper ngde"><table class="ng-doc-parameters-table ngde"><thead class="ngde"><tr indexable="false" class="ngde"><th class="ng-doc-parameters-table-name ngde">Name</th><th class="ng-doc-parameters-table-type ngde">Type</th><th class="ng-doc-parameters-table-description ngde">Description</th></tr></thead><tbody class="ngde"><tr class="ngde"><td indexable="false" class="ngde">value<div class="ng-doc-node-details ngde"></div></td><td class="ngde"><code indexable="false" class="ngde">string</code></td><td class="ngde"><p class="ngde">ISO date string</p></td></tr><tr class="ngde"><td indexable="false" class="ngde">display<div class="ng-doc-node-details ngde"></div></td><td class="ngde"><code indexable="false" class="ngde">"date" | "time" | "datetime"</code></td><td class="ngde"><p class="ngde">Display format</p></td></tr><tr class="ngde"><td indexable="false" class="ngde">utc<div class="ng-doc-node-details ngde"></div></td><td class="ngde"><code indexable="false" class="ngde">boolean</code></td><td class="ngde"><p class="ngde">Determines if the date should be displayed in UTC</p></td></tr></tbody></table></div><h5 class="no-anchor ngde" indexable="false">Returns</h5><p class="ngde"><code indexable="false" class="ngde">string</code></p></td></tr></tbody></table></div></section>`;

@Component({
  selector: 'ng-doc-page-ghooac2n',
  standalone: true,
  template: `<ng-doc-page></ng-doc-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPageComponent],
  providers: [{ provide: NgDocRootPage, useExisting: DynamicComponent }],
})
export class DynamicComponent extends NgDocRootPage {
  readonly routePrefix: string = 'docs';
  readonly pageType: NgDocPageType = 'api';
  readonly pageContent: string = pageContent;

  constructor() {
    super();
  }
}

const routes: Routes = [
  {
    path: '',
    component: DynamicComponent,
    title: `API References`,
  },
];

export default routes;
