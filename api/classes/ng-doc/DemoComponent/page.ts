// @ts-nocheck
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { NgDocDemoAssets, NgDocPageComponent, NgDocRootPage } from '@ng-doc/app';
import { isRoute, NgDocPage, NgDocPageType } from '@ng-doc/core';

const pageContent: string = `<header class="ngde"><div class="ng-doc-page-tags ngde"><span class="ng-doc-tag ngde" indexable="false" data-content="ng-doc-scope">ng-doc</span> <span class="ng-doc-inline-delimiter ngde" indexable="false">/</span> <span class="ng-doc-tag ngde" indexable="false" data-content="Class">Class</span> <span class="ng-doc-inline-delimiter ngde" indexable="false">/</span><div class="ng-doc-decorators-group ngde" indexable="false"><code class="ngde">@Component</code></div><span class="ng-doc-inline-delimiter ngde" indexable="false">/</span> <span class="ng-doc-tag ngde" indexable="false" data-content="ng-doc-tag-selector">ng-doc-demo</span></div><h1 id="democomponent" class="ngde">DemoComponent<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/DemoComponent#democomponent"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h1><!-- This is a hack to make the declaration name available to the search index. --><div style="display: none" class="ngde">%%API_NAME_ANCHOR%%</div></header><section class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></section><section class="ngde"><h2 id="constructor" class="ngde">Constructor<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/DemoComponent#constructor"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h2><div class="ng-doc-table-wrapper ngde"><table class="ng-doc-method-table ngde"><tbody class="ngde"><tr class="ngde"><td class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></td></tr><tr class="ngde"><td class="ngde"><h5 class="no-anchor ngde" indexable="false">Presentation</h5><pre class="ngde hljs"><code lang="typescript" class="hljs language-typescript code-lines ngde"><span class="line ngde"><span class="hljs-title function_ ngde">constructor</span>(<span class="hljs-params ngde"></span>
</span><span class="line ngde"><span class="hljs-params ngde">	</span>
</span><span class="line ngde"><span class="hljs-params ngde"></span>): <span class="hljs-title class_ ngde"><a href="/docs/api/classes/ng-doc/DemoComponent" class="ng-doc-code-anchor ngde" data-link-type="api" class="ngde">DemoComponent</a></span>;
</span></code></pre></td></tr><tr class="ngde"><td class="ngde"></td></tr></tbody></table></div></section><section class="ngde"><h2 id="properties" class="ngde">Properties<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/DemoComponent#properties"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h2><div class="ng-doc-table-wrapper ngde"><table class="ng-doc-properties-table ngde"><thead class="ngde"><tr indexable="false" class="ngde"><th class="ng-doc-properties-table-name ngde">Name</th><th class="ng-doc-properties-table-type ngde">Type</th><th class="ng-doc-properties-table-description ngde">Description</th></tr></thead><tbody class="ngde"><tr data-slug="signalInput" data-slugtype="member" id="signalInput" class="ngde"><td indexable="false" class="ngde">signalInput<div class="ng-doc-node-details ngde"></div></td><td class="ngde"><code indexable="false" class="ngde">InputSignalWithTransform&#x3C;number, string></code></td><td class="ngde"></td></tr><tr data-slug="test" data-slugtype="member" id="test" class="ngde"><td indexable="false" class="ngde">test<div class="ng-doc-node-details ngde"></div></td><td class="ngde"><code indexable="false" class="ngde">InputSignal&#x3C;string></code></td><td class="ngde"></td></tr></tbody></table></div></section><section class="ngde"><h2 id="methods" class="ngde">Methods<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/DemoComponent#methods"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h2><div class="ng-doc-table-wrapper ngde"><table class="ng-doc-method-table ngde"><thead class="ngde"><tr class="ngde"><th indexable="false" class="ngde"><h3 data-slugtype="member" id="method" class="ngde">method()<a title="Link to heading" class="ng-doc-header-link ngde" href="/docs/api/classes/ng-doc/DemoComponent#method"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h3><div class="ng-doc-node-details ngde"></div></th></tr></thead><tbody class="ngde"><tr class="ngde"><td class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></td></tr><tr class="ngde"><td class="ngde"><h5 class="no-anchor ngde" indexable="false">Presentation</h5><pre class="ngde hljs"><code lang="typescript" class="hljs language-typescript code-lines ngde"><span class="line ngde"><span class="hljs-title function_ ngde">method</span>(): <span class="hljs-built_in ngde">void</span>;
</span></code></pre></td></tr><tr class="ngde"><td class="ngde"><h5 class="no-anchor ngde" indexable="false">Returns</h5><p class="ngde"><code indexable="false" class="ngde">void</code></p></td></tr></tbody></table></div></section>`;

@Component({
  selector: 'ng-doc-page-zh5k7erd',
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
