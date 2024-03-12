// @ts-nocheck
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { NgDocDemoAssets, NgDocPageComponent, NgDocRootPage } from '@ng-doc/app';
import { isRoute, NgDocPage, NgDocPageType } from '@ng-doc/core';

const pageContent: string = `<header class="ngde"><div class="ng-doc-page-tags ngde"><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;span <span class="hljs-keyword ngde">class</span>=<span class="hljs-string ngde">"ng-doc-tag"</span> indexable=<span class="hljs-string ngde">"false"</span>
</span><span class="line ngde">      data-content=<span class="hljs-string ngde">"ng-doc-scope"</span>>ng-doc&#x3C;/span>
</span><span class="line ngde"><span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-inline-delimiter"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>/<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span></span>
</span><span class="line ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-tag"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span><span class="hljs-tag ngde"></span>
</span><span class="line ngde"><span class="hljs-tag ngde">      </span><span class="hljs-attr ngde">data-content</span>=<span class="hljs-string ngde">"Class"</span>>Class<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span>
</span><span class="line ngde">    <span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-inline-delimiter"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>/<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span></span>
</span><span class="line ngde">    
</span><span class="line ngde">
</span><span class="line ngde">    <span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-decorators-group "</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">code</span>></span>@Component<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span>
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">    <span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-inline-delimiter"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>/<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span></span>
</span><span class="line ngde">    &#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-tag"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span><span class="hljs-tag ngde"></span>
</span><span class="line ngde"><span class="hljs-tag ngde">      </span><span class="hljs-attr ngde">data-content</span>=<span class="hljs-string ngde">"ng-doc-tag-selector"</span>>ng-doc-demo<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span>
</span></code></pre></div><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;h1><span class="hljs-title class_ ngde"><a href="docs/classes/ng-doc/DemoComponent" class="ng-doc-code-anchor ngde" data-link-type="api" class="ngde">DemoComponent</a></span>&#x3C;/h1>
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">    &#x3C;!-- <span class="hljs-title class_ ngde">This</span> is a hack to make the declaration name available to the search index. -->
</span><span class="line ngde">    <span class="xml ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">style</span>=<span class="hljs-string ngde">"display: none"</span>></span>%%API_NAME_ANCHOR%%<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span></span>
</span></code></pre></header><section class="ngde"><span class="ng-doc-no-content ngde" indexable="false">No documentation has been provided.</span></section><section class="ngde"><h2 id="constructor" class="ngde">Constructor<a title="Link to heading" class="ng-doc-header-link ngde" href="docs/classes/ng-doc/DemoComponent#constructor"><ng-doc-icon icon="link-2" size="16" class="ngde"></ng-doc-icon></a></h2><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">&#x3C;div <span class="hljs-keyword ngde">class</span>=<span class="hljs-string ngde">"ng-doc-table-wrapper"</span>>
</span><span class="line ngde">    &#x3C;table class="ng-doc-method-table">
</span><span class="line ngde">        &#x3C;tbody>
</span><span class="line ngde">        &#x3C;tr>
</span><span class="line ngde">            &#x3C;td>
</span><span class="line ngde">                
</span><span class="line ngde">
</span><span class="line ngde">                &#x3C;span class="ng-doc-no-content" indexable="false">No documentation has been provided.&#x3C;/span>
</span><span class="line ngde">            &#x3C;/td>
</span><span class="line ngde">        &#x3C;/tr>
</span><span class="line ngde">        &#x3C;tr>
</span><span class="line ngde">            &#x3C;td>
</span><span class="line ngde">                &#x3C;h5 class="no-anchor" indexable="false">Presentation&#x3C;/h5>
</span><span class="line ngde">                &#x3C;pre>&#x3C;code lang="typescript"
</span><span class="line ngde">           class="language-typescript">constructor(
</span></code></pre><p class="ngde">): DemoComponent;</p><pre class="ngde hljs"><code class="hljs language-typescript code-lines ngde" lang="typescript" name="" icon="" highlightedlines="[]"><span class="line ngde">    &#x3C;/section>
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">section</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h2</span>></span>Properties<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h2</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span>
</span><span class="line ngde"><span class="xml ngde"></span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-table-wrapper"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">table</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-properties-table"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">thead</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">th</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-properties-table-name"</span>></span>Name<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">th</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">th</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-properties-table-type"</span>></span>Type<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">th</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">th</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-properties-table-description"</span>></span>Description<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">th</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">thead</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tbody</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span> <span class="hljs-attr ngde">dataSlug</span>=<span class="hljs-string ngde">"signalInput"</span> <span class="hljs-attr ngde">dataSlugType</span>=<span class="hljs-string ngde">"member"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">signalInput</span>
</span><span class="line ngde"><span class="xml ngde">                    </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-node-details"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">code</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>InputSignalWithTransform<span class="hljs-symbol ngde">&#x26;lt;</span>number, string<span class="hljs-symbol ngde">&#x26;gt;</span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde">            </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span> <span class="hljs-attr ngde">dataSlug</span>=<span class="hljs-string ngde">"test"</span> <span class="hljs-attr ngde">dataSlugType</span>=<span class="hljs-string ngde">"member"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">test</span>
</span><span class="line ngde"><span class="xml ngde">                    </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-node-details"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">code</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>InputSignal<span class="hljs-symbol ngde">&#x26;lt;</span>string<span class="hljs-symbol ngde">&#x26;gt;</span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tbody</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">table</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">section</span>></span>
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde">
</span><span class="line ngde"><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">section</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h2</span>></span>Methods<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h2</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span>
</span><span class="line ngde"><span class="xml ngde">    </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-table-wrapper"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">table</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-method-table"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">thead</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">th</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h3</span> <span class="hljs-attr ngde">dataSlugType</span>=<span class="hljs-string ngde">"member"</span>></span>method()<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h3</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">div</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-node-details"</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">th</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">thead</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tbody</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">span</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"ng-doc-no-content"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>No documentation has been provided.<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">span</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h5</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"no-anchor"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>Presentation<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h5</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">pre</span>></span>&#x3C;<span class="hljs-name ngde">code</span> <span class="hljs-attr ngde">lang</span>=<span class="hljs-string ngde">"typescript"</span><span class="hljs-tag ngde"></span>
</span><span class="line ngde"><span class="hljs-tag ngde">           </span><span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"language-typescript"</span>>method(): void;<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">pre</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">h5</span> <span class="hljs-attr ngde">class</span>=<span class="hljs-string ngde">"no-anchor"</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>Returns<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">h5</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">p</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                    </span><span class="hljs-tag ngde">&#x3C;<span class="hljs-name ngde">code</span> <span class="hljs-attr ngde">indexable</span>=<span class="hljs-string ngde">"false"</span>></span>void<span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">code</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">                </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">p</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">            </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">td</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tr</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">        </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">tbody</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">table</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">div</span>></span><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde"></span>
</span><span class="line ngde"><span class="xml ngde">    </span><span class="hljs-tag ngde">&#x3C;/<span class="hljs-name ngde">section</span>></span>
</span></code></pre></section>`;

@Component({
  selector: 'ng-doc-page-nvc2bxur',
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
