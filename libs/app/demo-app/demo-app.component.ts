import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';

import { ɵNG_DOC_DEMO_MESSAGE_SOURCE, ɵNgDocDemoSizeMessage } from './demo-message';

/**
 * The root of the demo application, which shows one demo per page with only Angular and that
 * demo loaded. In an iframe it reports the height of its content to the page that embeds it (a
 * `ResizeObserver` on its border box), and it follows the theme the reader picks on the
 * documentation site, which stores it in `localStorage`.
 */
@Component({
  selector: 'ng-doc-demo-app',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  // `flow-root`: the margins of the demo stay inside the measured box.
  styles: ':host { display: flow-root; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoAppComponent {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const destroyRef = inject(DestroyRef);

    if (!window) return;
    if (window.parent !== window) {
      const host: HTMLElement = inject(ElementRef).nativeElement;
      let reported = -1;
      const observer = new ResizeObserver(() => {
        const height = Math.ceil(host.getBoundingClientRect().height);

        if (height === reported) return;
        reported = height;
        const message: ɵNgDocDemoSizeMessage = {
          source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
          version: 1,
          type: 'size',
          height,
        };
        // Only a page of the same origin may receive it: the demo pages are part of the site.
        window.parent.postMessage(message, window.location.origin);
      });

      observer.observe(host, { box: 'border-box' });
      destroyRef.onDestroy(() => observer.disconnect());
    }

    // The documentation page and the demo page share the origin, so a theme the reader picks
    // reaches this page as a storage event. An empty id is the light theme, as in the restore
    // script that applies the stored theme before the application starts.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NG_DOC_STORE_THEME_KEY || event.newValue === null) return;
      if (event.newValue) {
        document.documentElement.setAttribute('data-theme', event.newValue);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };

    window.addEventListener('storage', onStorage);
    destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }
}
