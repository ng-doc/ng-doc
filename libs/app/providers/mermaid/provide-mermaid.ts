import { Provider } from '@angular/core';
import { NG_DOC_MERMAID } from '@ng-doc/app/tokens';
import mermaid, { MermaidConfig } from 'mermaid';

/**
 * Provides Mermaid instance.
 * @param config
 */
export function provideMermaid(config?: MermaidConfig): Provider {
  return {
    provide: NG_DOC_MERMAID,
    useFactory: () => {
      mermaid.initialize({ ...config, startOnLoad: false });

      return mermaid;
    },
  };
}
