// @ts-nocheck
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { NgDocDemoAssets, NgDocPageComponent, NgDocRootPage } from '@ng-doc/app';
import { isRoute, NgDocPage, NgDocPageType } from '@ng-doc/core';

const pageContent: string = `<header class="ngde"><div class="ng-doc-page-tags ngde"><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;span <span class="hljs-keyword ngde">class</span>=<span class="hljs-string ngde">"ng-doc-tag"</span> indexable=<span class="hljs-string ngde">"false"</span>
</span><span class="line ngde">      data-content=<span class="hljs-string ngde">"ng-doc-scope"</span>>ng-doc&#x3C;/span>
</span><span class="line ngde"><span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-inline-delimiter"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>/<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span></span>
</span><span class="line ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-tag"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span><span class="hljs-tag ngde"></span>
</span><span class="line ngde"><span class="hljs-tag ngde">      </span><span class="hljs-attr ngde">data-content</span>=<span class="hljs-string ngde">"Variable"</span>>Variable<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span>
</span></code></pre></div><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;h1><span class="hljs-title class_ ngde"><a href="docs/variables/ng-doc/Page" class="ng-doc-code-anchor ngde" data-link-type="api" class="ngde">Page</a></span>&#x3C;/h1>
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">    &#x3C;!-- <span class="hljs-title class_ ngde">This</span> is a hack to make the declaration name available to the search index. -->
</span><span class="line ngde">    <span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">style</span>=<span class="hljs-string ngde">"display: none"</span>></span>%%API_NAME_ANCHOR%%<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span></span>
</span></code></pre></header><section class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></section><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;section>
</span><span class="line ngde">    <span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h2</span>></span>Presentation<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h2</span>></span></span>
</span><span class="line ngde">    <span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">pre</span>></span>&#x3C;<span class="hljs-name ngde">code</span> <span class="hljs-attr ngde">lang</span>=<span class="hljs-string ngde">"typescript"</span><span class="hljs-tag ngde"></span>
</span><span class="line ngde"><span class="hljs-tag ngde">           </span><span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"language-typescript"</span>>const <a href="docs/variables/ng-doc/Page" class="ng-doc-code-anchor ngde" data-link-type="api" class="ngde">Page</a>: NgDocPage;<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">pre</span>></span>
</span><span class="line ngde">&#x3C;/section>
</span></code></pre>`;

@Component({
  selector: 'ng-doc-page-rx649beb',
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
